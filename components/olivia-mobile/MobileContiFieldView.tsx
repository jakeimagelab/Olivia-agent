"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, ClipboardList, Grid2X2, LayoutGrid, Maximize2 } from "lucide-react";
import type { ContiGroupRow, ContiRunRow, ContiSceneRow } from "@/components/conti/v2/types";
import styles from "./OliviaMobileShell.module.css";

type FieldMode = 1 | 4 | 8;
type ListedRun = ContiRunRow & { scene_count?: number; shooting_date?: string | null; shoot_date?: string | null };
type CalendarTask = { title?: string | null; location?: string | null; category?: string | null };
type WakeLockHandle = { release: () => Promise<void> };

function todayKey() {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });
}

function compactName(value?: string | null) {
  return (value || "").replace(/[\s·()\-_/]/g, "").toLocaleLowerCase("ko-KR");
}

function displayDate(value?: string | null) {
  if (!value) return "촬영일 미정";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return `촬영일 ${value}`;
  return `촬영일 ${date.toLocaleDateString("ko-KR", { month: "numeric", day: "numeric" })}`;
}

function storageKey(runId: string) {
  return `olivia:mobile-conti-field:${runId}:completed-scene-ids`;
}

function readCompleted(runId: string) {
  try {
    const value = window.localStorage.getItem(storageKey(runId));
    const parsed = value ? JSON.parse(value) : [];
    return new Set(Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : []);
  } catch {
    return new Set<string>();
  }
}

function isTodayShootingMatch(run: ListedRun, task: CalendarTask) {
  const hospital = compactName(run.hospital_name);
  if (!hospital) return false;
  const scheduleText = compactName(`${task.title || ""} ${task.location || ""}`);
  return Boolean(scheduleText) && (scheduleText.includes(hospital) || hospital.includes(scheduleText));
}

export default function MobileContiFieldView() {
  const [runs, setRuns] = useState<ListedRun[]>([]);
  const [runId, setRunId] = useState<string | null>(null);
  const [run, setRun] = useState<ContiRunRow | null>(null);
  const [groups, setGroups] = useState<ContiGroupRow[]>([]);
  const [scenes, setScenes] = useState<ContiSceneRow[]>([]);
  const [mode, setMode] = useState<FieldMode>(1);
  const [completed, setCompleted] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const wakeLockRef = useRef<WakeLockHandle | null>(null);

  const loadRun = useCallback(async (id: string) => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/conti/runs/${encodeURIComponent(id)}`, { cache: "no-store" });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.ok || !payload.run) throw new Error(payload?.error || "콘티를 불러오지 못했습니다.");
      setRun(payload.run);
      setGroups(Array.isArray(payload.groups) ? payload.groups : []);
      setScenes(Array.isArray(payload.scenes) ? payload.scenes : []);
      setCompleted(readCompleted(id));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "콘티를 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadCandidates = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [runsResponse, calendarResponse] = await Promise.all([
        fetch("/api/conti/runs?list=1&limit=60", { cache: "no-store" }),
        fetch(`/api/calendar?date=${todayKey()}`, { cache: "no-store" }),
      ]);
      const runsPayload = await runsResponse.json().catch(() => null);
      const calendarPayload = await calendarResponse.json().catch(() => null);
      if (!runsResponse.ok || !runsPayload?.ok) throw new Error(runsPayload?.error || "콘티 목록을 불러오지 못했습니다.");
      const listedRuns = Array.isArray(runsPayload.runs) ? runsPayload.runs as ListedRun[] : [];
      setRuns(listedRuns);
      const shootingTasks = Array.isArray(calendarPayload?.tasks)
        ? (calendarPayload.tasks as CalendarTask[]).filter((task) => task.category === "shooting" || /촬영/.test(`${task.title || ""} ${task.location || ""}`))
        : [];
      const matches = listedRuns.filter((candidate) => shootingTasks.some((task) => isTodayShootingMatch(candidate, task)));
      if (matches.length === 1) setRunId(matches[0].id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "콘티 목록을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadCandidates(); }, [loadCandidates]);
  useEffect(() => { if (runId) void loadRun(runId); }, [loadRun, runId]);

  useEffect(() => {
    const nav = navigator as Navigator & { wakeLock?: { request: (type: "screen") => Promise<WakeLockHandle> } };
    if (!runId || !nav.wakeLock) return;
    let active = true;
    const acquire = async () => {
      try {
        if (active && document.visibilityState === "visible") wakeLockRef.current = await nav.wakeLock!.request("screen");
      } catch (cause) {
        // Wake Lock은 지원하지 않는 PWA에서도 현장 뷰를 막지 않는 보조 기능이다.
        console.warn("[MOBILE_CONTI] 화면 잠금 방지를 요청하지 못했습니다.", cause);
      }
    };
    const onVisibility = () => { if (document.visibilityState === "visible") void acquire(); };
    void acquire();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      active = false;
      document.removeEventListener("visibilitychange", onVisibility);
      void wakeLockRef.current?.release().catch(() => undefined);
      wakeLockRef.current = null;
    };
  }, [runId]);

  const sortedScenes = useMemo(() => {
    const groupOrder = new Map(groups.map((group) => [group.id, group.sort]));
    return [...scenes].sort((left, right) => (groupOrder.get(left.group_id || "") ?? 999) - (groupOrder.get(right.group_id || "") ?? 999) || left.sort - right.sort);
  }, [groups, scenes]);

  const toggleScene = useCallback((sceneId: string) => {
    if (!runId) return;
    setCompleted((current) => {
      const next = new Set(current);
      if (next.has(sceneId)) next.delete(sceneId); else next.add(sceneId);
      try {
        window.localStorage.setItem(storageKey(runId), JSON.stringify([...next]));
      } catch (cause) {
        // local 표시 실패는 서버 상태를 바꾸지 않는다.
        console.warn("[MOBILE_CONTI] 현장 완료 표시를 기기에 저장하지 못했습니다.", cause);
      }
      return next;
    });
  }, [runId]);

  const advanceMode = () => setMode((current) => current === 1 ? 4 : current === 4 ? 8 : 1);

  if (loading) return <section className={styles.screen}><div className={styles.emptyState}>현장 콘티를 준비하고 있어요...</div></section>;
  if (error) return <section className={styles.screen}><div className={styles.errorState}><span>{error}</span><button type="button" onClick={() => runId ? void loadRun(runId) : void loadCandidates()}>다시 시도</button></div></section>;
  if (!runId || !run) return (
    <section className={`${styles.screen} ${styles.mobileContiPicker}`} aria-label="현장 콘티 선택" data-mobile-swipe-lock>
      <div className={styles.mobileContiPickerHeading}><ClipboardList size={22} /><div><h1>현장 콘티</h1><p>오늘 촬영할 콘티를 선택하세요.</p></div></div>
      {runs.length ? <div className={styles.mobileContiRunList}>{runs.map((candidate) => <button type="button" key={candidate.id} onClick={() => setRunId(candidate.id)}>
        <span><strong>{candidate.hospital_name || "이름 없는 콘티"}</strong><small>{displayDate(candidate.shooting_date || candidate.shoot_date || candidate.updated_at)} · 장면 {candidate.scene_count ?? 0}개</small></span>
        <span>열기</span>
      </button>)}</div> : <div className={styles.emptyState}>열 수 있는 콘티가 없습니다.</div>}
    </section>
  );

  const ModeIcon = mode === 1 ? Maximize2 : mode === 4 ? Grid2X2 : LayoutGrid;
  return (
    <section className={`${styles.screen} ${styles.mobileContiField} ${styles[`mobileContiField_${mode}`]}`} aria-label="현장 콘티" data-mobile-swipe-lock>
      <header className={styles.mobileContiFieldHeader}>
        <div><small>현장 콘티</small><h1>{run.hospital_name || "촬영 콘티"}</h1><p>{completed.size}/{sortedScenes.length} 장면 완료</p></div>
        <button type="button" onClick={advanceMode} aria-label={`카드 ${mode}개 보기`}><ModeIcon size={17} /><b>{mode}</b></button>
      </header>
      <div className={styles.mobileContiSceneGrid}>{sortedScenes.map((scene, index) => {
        const done = completed.has(scene.id);
        return <button type="button" key={scene.id} className={done ? styles.mobileContiSceneDone : undefined} onClick={() => toggleScene(scene.id)}>
          <span className={styles.mobileContiSceneNumber}>{done ? <Check size={16} /> : String(index + 1).padStart(2, "0")}</span>
          <strong>{scene.name}</strong>
          {mode !== 8 && scene.preparation_text ? <small>{scene.preparation_text}</small> : null}
          {mode === 1 && scene.note ? <p>{scene.note}</p> : null}
        </button>;
      })}</div>
    </section>
  );
}
