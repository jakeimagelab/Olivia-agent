"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { deriveContiChecklist } from "@/lib/conti/deriveChecklist";
import { deriveContiSchedule } from "@/lib/conti/deriveSchedule";
import { normalizeContiStudioState, type ContiFieldCardSize, type ContiStudioState } from "@/lib/conti/studioState";
import type { ContiEditableSceneField, ContiSaveStatus, ContiStudioDocument } from "@/components/conti/v2/types";

type ScenePatch = { fields?: Partial<Record<ContiEditableSceneField, string | number | null>>; completed?: boolean };
type HistorySnapshot = Pick<ContiStudioDocument, "scenes" | "studioState">;

function cloneHistorySnapshot(document: ContiStudioDocument): HistorySnapshot {
  return { scenes: structuredClone(document.scenes), studioState: structuredClone(document.studioState) };
}

async function readDocument(runId: string): Promise<ContiStudioDocument> {
  const response = await fetch(`/api/conti/runs/${runId}`, { cache: "no-store" });
  const body = await response.json();
  if (!response.ok || !body.ok) throw new Error(body.error ?? "콘티를 불러오지 못했습니다.");
  return {
    run: body.run,
    groups: body.groups ?? [],
    scenes: (body.scenes ?? []).map((scene: Record<string, unknown>) => ({ ...scene, completed: Boolean(scene.completed), preparation_text: scene.preparation_text ?? "" })),
    studioState: normalizeContiStudioState(body.run?.studio_state),
  };
}

export function useContiStudio(runId: string | null) {
  const [document, setDocument] = useState<ContiStudioDocument | null>(null);
  const [loading, setLoading] = useState(Boolean(runId));
  const [error, setError] = useState("");
  const [saveStatus, setSaveStatus] = useState<ContiSaveStatus>("idle");
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [historyRevision, setHistoryRevision] = useState(0);

  const documentRef = useRef(document);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scenePatchesRef = useRef(new Map<string, ScenePatch>());
  const orderDirtyRef = useRef(false);
  const studioDirtyRef = useRef(false);
  const mutationVersionRef = useRef(0);
  const flushRef = useRef<() => Promise<boolean>>(async () => false);
  const undoRef = useRef<HistorySnapshot[]>([]);
  const redoRef = useRef<HistorySnapshot[]>([]);

  useEffect(() => { documentRef.current = document; }, [document]);

  const load = useCallback(async () => {
    if (!runId) { setDocument(null); setLoading(false); return; }
    setLoading(true); setError(""); setSaveStatus("idle");
    try {
      const next = await readDocument(runId);
      setDocument(next); documentRef.current = next;
      undoRef.current = []; redoRef.current = []; setHistoryRevision((value) => value + 1);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "콘티를 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, [runId]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  const scheduleSave = useCallback(() => {
    mutationVersionRef.current += 1;
    setSaveStatus("dirty");
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => { void flushRef.current(); }, 900);
  }, []);

  const pushHistory = useCallback(() => {
    const current = documentRef.current;
    if (!current) return;
    undoRef.current = [...undoRef.current.slice(-49), cloneHistorySnapshot(current)];
    redoRef.current = [];
    setHistoryRevision((value) => value + 1);
  }, []);

  const queueScenePatch = useCallback((sceneId: string, patch: ScenePatch) => {
    const previous = scenePatchesRef.current.get(sceneId) ?? {};
    scenePatchesRef.current.set(sceneId, {
      ...previous,
      ...patch,
      fields: { ...(previous.fields ?? {}), ...(patch.fields ?? {}) },
    });
  }, []);

  const flushSave = useCallback(async (): Promise<boolean> => {
    const current = documentRef.current;
    if (!runId || !current) return false;
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
    const startVersion = mutationVersionRef.current;
    const capturedPatches = new Map(scenePatchesRef.current);
    const capturedOrder = orderDirtyRef.current;
    const capturedStudio = studioDirtyRef.current;
    scenePatchesRef.current.clear(); orderDirtyRef.current = false; studioDirtyRef.current = false;
    if (!capturedPatches.size && !capturedOrder && !capturedStudio) {
      setSaveStatus("saved");
      return true;
    }
    setSaveStatus("saving"); setError("");
    try {
      const tasks: Promise<Response>[] = [];
      for (const [sceneId, patch] of capturedPatches) {
        tasks.push(fetch(`/api/conti/scenes/${sceneId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) }));
      }
      if (capturedOrder) {
        tasks.push(fetch(`/api/conti/runs/${runId}/reorder`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ orderedSceneIds: current.scenes.map((scene) => scene.id) }) }));
      }
      if (capturedStudio) {
        tasks.push(fetch(`/api/conti/runs/${runId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ studioState: current.studioState }) }));
      }
      const responses = await Promise.all(tasks);
      for (const response of responses) {
        const body = await response.json().catch(() => ({}));
        if (!response.ok || !body.ok) throw new Error(body.error ?? "콘티 저장에 실패했습니다.");
      }
      const verified = await readDocument(runId);
      if (mutationVersionRef.current === startVersion) {
        setDocument(verified); documentRef.current = verified; setSaveStatus("saved"); setLastSavedAt(new Date());
      } else {
        setSaveStatus("dirty");
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => { void flushRef.current(); }, 250);
      }
      return true;
    } catch (caught) {
      for (const [sceneId, patch] of capturedPatches) queueScenePatch(sceneId, patch);
      orderDirtyRef.current ||= capturedOrder;
      studioDirtyRef.current ||= capturedStudio;
      setSaveStatus("failed");
      setError(caught instanceof Error ? caught.message : "콘티 저장에 실패했습니다.");
      return false;
    }
  }, [queueScenePatch, runId]);

  useEffect(() => { flushRef.current = flushSave; }, [flushSave]);

  const updateSceneFields = useCallback((sceneId: string, fields: Partial<Record<ContiEditableSceneField, string | number | null>>) => {
    pushHistory();
    setDocument((current) => {
      if (!current) return current;
      const next = { ...current, scenes: current.scenes.map((scene) => scene.id === sceneId ? { ...scene, ...fields, field_sources: { ...scene.field_sources, ...Object.fromEntries(Object.keys(fields).map((key) => [key, "user"])) } } as typeof scene : scene) };
      documentRef.current = next;
      return next;
    });
    queueScenePatch(sceneId, { fields }); scheduleSave();
  }, [pushHistory, queueScenePatch, scheduleSave]);

  const toggleSceneComplete = useCallback((sceneId: string) => {
    const scene = documentRef.current?.scenes.find((item) => item.id === sceneId);
    if (!scene) return;
    pushHistory();
    setDocument((current) => {
      if (!current) return current;
      const next = { ...current, scenes: current.scenes.map((item) => item.id === sceneId ? { ...item, completed: !item.completed } : item) };
      documentRef.current = next; return next;
    });
    queueScenePatch(sceneId, { completed: !scene.completed }); scheduleSave();
  }, [pushHistory, queueScenePatch, scheduleSave]);

  const reorderScenes = useCallback((activeId: string, overId: string) => {
    const current = documentRef.current;
    if (!current || activeId === overId) return;
    const fromIndex = current.scenes.findIndex((scene) => scene.id === activeId);
    const toIndex = current.scenes.findIndex((scene) => scene.id === overId);
    if (fromIndex < 0 || toIndex < 0) return;
    pushHistory();
    const scenes = [...current.scenes];
    const [moved] = scenes.splice(fromIndex, 1);
    scenes.splice(toIndex, 0, moved);
    const next = { ...current, scenes: scenes.map((scene, sort) => ({ ...scene, sort })) };
    setDocument(next); documentRef.current = next; orderDirtyRef.current = true; scheduleSave();
  }, [pushHistory, scheduleSave]);

  const updateStudioState = useCallback((updater: (state: ContiStudioState) => ContiStudioState) => {
    pushHistory();
    setDocument((current) => {
      if (!current) return current;
      const next = { ...current, studioState: normalizeContiStudioState(updater(current.studioState)) };
      documentRef.current = next; return next;
    });
    studioDirtyRef.current = true; scheduleSave();
  }, [pushHistory, scheduleSave]);

  const toggleChecklistItem = useCallback((itemId: string) => updateStudioState((state) => ({
    ...state,
    checklistCompleted: { ...state.checklistCompleted, [itemId]: !state.checklistCompleted[itemId] },
  })), [updateStudioState]);

  const setScheduleStartTime = useCallback((value: string) => updateStudioState((state) => ({ ...state, scheduleStartTime: value || undefined })), [updateStudioState]);
  const setFieldCardSize = useCallback((value: ContiFieldCardSize) => updateStudioState((state) => ({ ...state, fieldCardSize: value })), [updateStudioState]);
  const setSceneCameraAngle = useCallback((sceneId: string, cameraAngle: string) => updateStudioState((state) => ({
    ...state,
    sceneMeta: { ...state.sceneMeta, [sceneId]: { ...state.sceneMeta[sceneId], cameraAngle } },
  })), [updateStudioState]);

  const addChecklistItem = useCallback((label: string) => {
    const clean = label.trim();
    if (!clean) return;
    updateStudioState((state) => ({ ...state, extraChecklistItems: [...state.extraChecklistItems, { id: `manual-${crypto.randomUUID()}`, label: clean }] }));
  }, [updateStudioState]);

  const addScene = useCallback(async () => {
    if (!runId || !documentRef.current) return false;
    setSaveStatus("saving");
    try {
      const scenes = documentRef.current.scenes;
      const response = await fetch("/api/conti/scenes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ runId, groupId: scenes.at(-1)?.group_id ?? null }) });
      const body = await response.json();
      if (!response.ok || !body.ok) throw new Error(body.error ?? "장면 추가에 실패했습니다.");
      const next = { ...documentRef.current, scenes: [...documentRef.current.scenes, { ...body.scene, completed: false, preparation_text: body.scene.preparation_text ?? "" }] };
      setDocument(next); documentRef.current = next; setSaveStatus("saved"); setLastSavedAt(new Date());
      return true;
    } catch (caught) { setError(caught instanceof Error ? caught.message : "장면 추가에 실패했습니다."); setSaveStatus("failed"); return false; }
  }, [runId]);

  const duplicateScene = useCallback(async (sceneId: string) => {
    if (!documentRef.current) return false;
    setSaveStatus("saving");
    try {
      const response = await fetch(`/api/conti/scenes/${sceneId}/duplicate`, { method: "POST" });
      const body = await response.json();
      if (!response.ok || !body.ok) throw new Error(body.error ?? "장면 복제에 실패했습니다.");
      const current = documentRef.current;
      const sourceIndex = current.scenes.findIndex((scene) => scene.id === sceneId);
      const scenes = [...current.scenes];
      scenes.splice(sourceIndex + 1, 0, { ...body.scene, completed: false, preparation_text: body.scene.preparation_text ?? "" });
      const next = { ...current, scenes: scenes.map((scene, sort) => ({ ...scene, sort })) };
      setDocument(next); documentRef.current = next; orderDirtyRef.current = true; scheduleSave();
      return true;
    } catch (caught) { setError(caught instanceof Error ? caught.message : "장면 복제에 실패했습니다."); setSaveStatus("failed"); return false; }
  }, [scheduleSave]);

  const deleteScene = useCallback(async (sceneId: string) => {
    const current = documentRef.current;
    if (!current) return false;
    const next = { ...current, scenes: current.scenes.filter((scene) => scene.id !== sceneId).map((scene, sort) => ({ ...scene, sort })) };
    setDocument(next); documentRef.current = next; setSaveStatus("saving");
    try {
      const response = await fetch(`/api/conti/scenes/${sceneId}`, { method: "DELETE" });
      const body = await response.json();
      if (!response.ok || !body.ok) throw new Error(body.error ?? "장면 삭제에 실패했습니다.");
      orderDirtyRef.current = true; scheduleSave(); return true;
    } catch (caught) {
      setDocument(current); documentRef.current = current; setError(caught instanceof Error ? caught.message : "장면 삭제에 실패했습니다."); setSaveStatus("failed"); return false;
    }
  }, [scheduleSave]);

  const applyHistory = useCallback((target: HistorySnapshot) => {
    const current = documentRef.current;
    if (!current) return;
    const next = { ...current, scenes: structuredClone(target.scenes), studioState: structuredClone(target.studioState) };
    setDocument(next); documentRef.current = next;
    for (const scene of next.scenes) queueScenePatch(scene.id, {
      fields: { name: scene.name, space_text: scene.space_text, minutes: scene.minutes, keyword: scene.keyword, description: scene.description, people_text: scene.people_text, patient_role_text: scene.patient_role_text, preparation_text: scene.preparation_text, note: scene.note },
      completed: scene.completed,
    });
    orderDirtyRef.current = true; studioDirtyRef.current = true; scheduleSave();
  }, [queueScenePatch, scheduleSave]);

  const undo = useCallback(() => {
    const current = documentRef.current; const target = undoRef.current.pop();
    if (!current || !target) return;
    redoRef.current.push(cloneHistorySnapshot(current)); applyHistory(target); setHistoryRevision((value) => value + 1);
  }, [applyHistory]);
  const redo = useCallback(() => {
    const current = documentRef.current; const target = redoRef.current.pop();
    if (!current || !target) return;
    undoRef.current.push(cloneHistorySnapshot(current)); applyHistory(target); setHistoryRevision((value) => value + 1);
  }, [applyHistory]);

  const linkCanonicalConti = useCallback(async (hospitalId?: string, workflowRunId?: string) => {
    if (!runId || !documentRef.current) return false;
    const response = await fetch(`/api/conti/runs/${runId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ hospitalId: hospitalId ?? documentRef.current.run.hospital_id, workflowRunId: workflowRunId ?? documentRef.current.run.workflow_run_id }) });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || !body.ok) { setError(body.error ?? "고객 연결에 실패했습니다."); setSaveStatus("failed"); return false; }
    const verified = await readDocument(runId);
    setDocument(verified); documentRef.current = verified; setSaveStatus("saved"); setLastSavedAt(new Date()); return true;
  }, [runId]);

  const checklist = useMemo(() => document ? deriveContiChecklist(document.scenes, document.studioState) : [], [document]);
  const schedule = useMemo(() => document ? deriveContiSchedule(document.scenes, document.studioState.scheduleStartTime) : [], [document]);

  return {
    document, loading, error, saveStatus, lastSavedAt, checklist, schedule,
    canUndo: historyRevision >= 0 && undoRef.current.length > 0,
    canRedo: historyRevision >= 0 && redoRef.current.length > 0,
    reload: load, flushSave, updateSceneFields, toggleSceneComplete, reorderScenes,
    toggleChecklistItem, addChecklistItem, setScheduleStartTime, setFieldCardSize, setSceneCameraAngle,
    addScene, duplicateScene, deleteScene, undo, redo, linkCanonicalConti,
  };
}

export type ContiStudioController = ReturnType<typeof useContiStudio>;
