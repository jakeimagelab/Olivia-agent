"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronRight, List, Maximize2, Minimize2, MoreVertical, Plus, Sparkles, Wrench, X } from "lucide-react";
import { C, R } from "@/lib/theme";
import CanvasObject from "@/components/youtube-editing/CanvasObject";
import CurrentSegmentHeader from "@/components/youtube-editing/CurrentSegmentHeader";
import DoctorPosePopup from "@/components/youtube-editing/DoctorPosePopup";
import DrawingToolbar from "@/components/youtube-editing/DrawingToolbar";
import EditToolsPanel from "@/components/youtube-editing/EditToolsPanel";
import OptionsSummaryBar from "@/components/youtube-editing/OptionsSummaryBar";
import QuickOptionCards from "@/components/youtube-editing/QuickOptionCards";
import SaveStatus from "@/components/youtube-editing/SaveStatus";
import ScriptPanel from "@/components/youtube-editing/ScriptPanel";
import SegmentTimeline from "@/components/youtube-editing/SegmentTimeline";
import StoryboardCanvas from "@/components/youtube-editing/StoryboardCanvas";
import { splitScriptIntoSentences, VISUAL_STYLE_TO_PROMPT_PRESET } from "@/lib/youtube-editing/constants";
import { exportProjectJson, printProjectSummary } from "@/lib/youtube-editing/export";
import type {
  CanvasObject as CanvasObjectData, CanvasObjectType, DoctorPoseKey, DrawTool, SaveState,
  Segment, SegmentAnnotation, Stroke, YoutubeEditingProject,
} from "@/lib/youtube-editing/types";

type ProjectListItem = { id: string; title: string; status: string; updated_at: string; segmentCount: number };

function relativeTime(iso: string): string {
  const diffMin = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (diffMin < 1) return "방금 전";
  if (diffMin < 60) return `${diffMin}분 전`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour}시간 전`;
  return `${Math.floor(diffHour / 24)}일 전`;
}

function useDebouncedSaver() {
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  return useCallback((key: string, fn: () => void, delay = 800) => {
    const existing = timers.current.get(key);
    if (existing) clearTimeout(existing);
    timers.current.set(key, setTimeout(fn, delay));
  }, []);
}

export default function YoutubeEditingContiPage() {
  return (
    <Suspense fallback={<main className="pc-page" style={{ display: "grid", placeItems: "center", minHeight: "60vh", color: C.muted }}>불러오는 중...</main>}>
      <YoutubeEditingContiInner />
    </Suspense>
  );
}

function YoutubeEditingContiInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const projectIdParam = searchParams.get("project");

  const [project, setProject] = useState<YoutubeEditingProject | null>(null);
  const [projectList, setProjectList] = useState<ProjectListItem[]>([]);
  const [segments, setSegments] = useState<Segment[]>([]);
  const [annotationsBySegment, setAnnotationsBySegment] = useState<Record<string, SegmentAnnotation>>({});
  const [canvasObjectsBySegment, setCanvasObjectsBySegment] = useState<Record<string, CanvasObjectData[]>>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedObjectId, setSelectedObjectId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [bootstrapError, setBootstrapError] = useState("");
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [analyzing, setAnalyzing] = useState(false);
  const [generatingPrompt, setGeneratingPrompt] = useState(false);
  const [promptResult, setPromptResult] = useState("");
  const [moreOpen, setMoreOpen] = useState(false);
  const [generatingPoses, setGeneratingPoses] = useState(false);
  const [poseGenMessage, setPoseGenMessage] = useState("");

  const [tool, setTool] = useState<DrawTool>("pen");
  const [color, setColor] = useState("#111111");
  const [strokeWidth, setStrokeWidth] = useState(3);
  const [undoStack, setUndoStack] = useState<Stroke[][]>([]);
  const [redoStack, setRedoStack] = useState<Stroke[][]>([]);
  const [posePopupOpen, setPosePopupOpen] = useState(false);
  const [optionsExpanded, setOptionsExpanded] = useState(false);
  const optionsBarRef = useRef<HTMLDivElement>(null);
  const [optionsBarRect, setOptionsBarRect] = useState<DOMRect | null>(null);
  useEffect(() => {
    if (optionsExpanded && optionsBarRef.current) setOptionsBarRect(optionsBarRef.current.getBoundingClientRect());
  }, [optionsExpanded]);
  const [zoom, setZoom] = useState(100);
  const [zenMode, setZenMode] = useState(false);
  const [scriptDrawerOpen, setScriptDrawerOpen] = useState(false);
  const [toolsDrawerOpen, setToolsDrawerOpen] = useState(false);
  const mainRef = useRef<HTMLElement>(null);

  const canvasContainerRef = useRef<HTMLDivElement>(null);
  const scheduleSave = useDebouncedSaver();

  const loadBundle = useCallback(async (projectId: string) => {
    setLoading(true);
    setBootstrapError("");
    try {
      const response = await fetch(`/api/youtube-editing/projects/${projectId}`, { cache: "no-store" });
      const data = await response.json();
      if (!data.ok) throw new Error(data.error);
      setProject(data.project);
      setSegments(data.segments);
      setAnnotationsBySegment(data.annotationsBySegment ?? {});
      setCanvasObjectsBySegment(data.canvasObjectsBySegment ?? {});
      setSelectedId((current) => current && data.segments.some((s: Segment) => s.id === current) ? current : (data.segments[0]?.id ?? null));
    } catch (error) {
      setBootstrapError(error instanceof Error ? error.message : "프로젝트를 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadProjectList = useCallback(async () => {
    setLoading(true);
    setBootstrapError("");
    try {
      const response = await fetch("/api/youtube-editing/projects", { cache: "no-store" });
      const data = await response.json();
      if (!data.ok) throw new Error(data.error);
      setProjectList(data.projects ?? []);
    } catch (error) {
      setBootstrapError(error instanceof Error ? error.message : "문서 목록을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, []);

  // 쿼리에 프로젝트가 지정되면 그 문서를 열고, 없으면(첫 진입) 저장된 문서 목록을 보여준다 —
  // 예전처럼 가장 최근 문서로 자동 이동하지 않는다.
  useEffect(() => {
    if (projectIdParam) {
      void loadBundle(projectIdParam);
    } else {
      setProject(null);
      void loadProjectList();
    }
  }, [projectIdParam, loadBundle, loadProjectList]);

  useEffect(() => { setUndoStack([]); setRedoStack([]); setSelectedObjectId(null); setOptionsExpanded(false); setScriptDrawerOpen(false); }, [selectedId]);

  // 실제 브라우저 전체화면(예: 데스크톱 ESC 키)이 바깥에서 종료되면 인앱 상태도 같이 되돌린다.
  useEffect(() => {
    const onFsChange = () => { if (!document.fullscreenElement) setZenMode(false); };
    document.addEventListener("fullscreenchange", onFsChange);
    return () => document.removeEventListener("fullscreenchange", onFsChange);
  }, []);

  const selectedSegment = useMemo(() => segments.find((s) => s.id === selectedId) ?? null, [segments, selectedId]);
  const selectedIndex = useMemo(() => segments.findIndex((s) => s.id === selectedId), [segments, selectedId]);
  const currentStrokes = selectedId ? (annotationsBySegment[selectedId]?.strokes ?? []) : [];
  const currentCanvasObjects = selectedId ? (canvasObjectsBySegment[selectedId] ?? []) : [];
  const selectedObject = currentCanvasObjects.find((o) => o.id === selectedObjectId) ?? null;

  // ── 문장 편집 ──────────────────────────────────────────
  const updateSegment = (id: string, patch: Partial<Segment>) => {
    setSegments((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
    setSaveState("saving");
    scheduleSave(`segment:${id}`, async () => {
      try {
        const response = await fetch(`/api/youtube-editing/segments/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...patch, userModified: true }),
        });
        const data = await response.json();
        if (!data.ok) throw new Error(data.error);
        setSaveState("saved");
      } catch {
        setSaveState("error");
      }
    });
  };

  const addSegment = async (afterId?: string) => {
    if (!project) return;
    const response = await fetch(`/api/youtube-editing/projects/${project.id}/segments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scriptText: "", afterSegmentId: afterId }),
    });
    const data = await response.json();
    if (!data.ok) return;
    await loadBundle(project.id);
    setSelectedId(data.segment.id);
  };

  const deleteSegment = async (id: string) => {
    if (!project || segments.length <= 1) return;
    const index = segments.findIndex((s) => s.id === id);
    await fetch(`/api/youtube-editing/segments/${id}`, { method: "DELETE" });
    const next = segments.filter((s) => s.id !== id);
    setSegments(next);
    if (selectedId === id) setSelectedId(next[Math.max(0, index - 1)]?.id ?? next[0]?.id ?? null);
  };

  const reorderSegments = async (nextOrder: Segment[]) => {
    if (!project) return;
    setSegments(nextOrder);
    await fetch(`/api/youtube-editing/projects/${project.id}/segments`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderedIds: nextOrder.map((s) => s.id) }),
    });
  };

  const moveSegment = (id: string, direction: "up" | "down") => {
    const index = segments.findIndex((s) => s.id === id);
    const target = direction === "up" ? index - 1 : index + 1;
    if (index < 0 || target < 0 || target >= segments.length) return;
    const next = [...segments];
    [next[index], next[target]] = [next[target], next[index]];
    void reorderSegments(next);
  };

  const duplicateSegment = async (id: string) => {
    if (!project) return;
    const original = segments.find((s) => s.id === id);
    if (!original) return;
    const response = await fetch(`/api/youtube-editing/projects/${project.id}/segments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scriptText: original.scriptText, afterSegmentId: id }),
    });
    const data = await response.json();
    if (!data.ok) return;
    await fetch(`/api/youtube-editing/segments/${data.segment.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        camera: original.camera, caption: original.caption, visual: original.visual,
        soundEffect: original.soundEffect, transition: original.transition, template: original.template,
        estimatedDurationSec: original.estimatedDurationSec,
      }),
    });
    await loadBundle(project.id);
    setSelectedId(data.segment.id);
  };

  const splitSegment = async (id: string) => {
    if (!project) return;
    const segment = segments.find((s) => s.id === id);
    if (!segment) return;
    const parts = splitScriptIntoSentences(segment.scriptText);
    if (parts.length < 2) return;
    const [first, ...rest] = parts;
    updateSegment(id, { scriptText: first });
    const response = await fetch(`/api/youtube-editing/projects/${project.id}/segments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scriptText: rest.join(" "), afterSegmentId: id }),
    });
    const data = await response.json();
    if (data.ok) await loadBundle(project.id);
  };

  const mergeNext = async (id: string) => {
    const index = segments.findIndex((s) => s.id === id);
    const next = segments[index + 1];
    if (!next) return;
    const current = segments[index];
    updateSegment(id, { scriptText: `${current.scriptText} ${next.scriptText}`.trim() });
    await fetch(`/api/youtube-editing/segments/${next.id}`, { method: "DELETE" });
    setSegments((prev) => prev.filter((s) => s.id !== next.id));
  };

  // ── 손글씨 캔버스 ──────────────────────────────────────
  const saveAnnotation = (segmentId: string, strokes: Stroke[]) => {
    if (!project) return;
    setSaveState("saving");
    scheduleSave(`annotation:${segmentId}`, async () => {
      try {
        const canvas = canvasContainerRef.current;
        const response = await fetch(`/api/youtube-editing/segments/${segmentId}/annotation`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            projectId: project.id, strokes,
            canvasWidth: canvas?.clientWidth ?? null, canvasHeight: canvas?.clientHeight ?? null,
          }),
        });
        const data = await response.json();
        if (!data.ok) throw new Error(data.error);
        setSaveState("saved");
      } catch {
        setSaveState("error");
      }
    });
  };

  const applyStrokes = (next: Stroke[], pushUndo: boolean) => {
    if (!selectedId) return;
    if (pushUndo) {
      setUndoStack((prev) => [...prev, currentStrokes]);
      setRedoStack([]);
    }
    setAnnotationsBySegment((prev) => ({
      ...prev,
      [selectedId]: {
        segmentId: selectedId, strokes: next,
        canvasWidth: prev[selectedId]?.canvasWidth ?? null, canvasHeight: prev[selectedId]?.canvasHeight ?? null,
      },
    }));
    saveAnnotation(selectedId, next);
  };

  const handleStrokeCommit = (stroke: Stroke) => applyStrokes([...currentStrokes, stroke], true);
  const handleEraseStrokes = (ids: string[]) => applyStrokes(currentStrokes.filter((s) => !ids.includes(s.id)), true);
  const handleUndo = () => {
    if (!undoStack.length) return;
    const previous = undoStack[undoStack.length - 1];
    setUndoStack((s) => s.slice(0, -1));
    setRedoStack((s) => [...s, currentStrokes]);
    applyStrokes(previous, false);
  };
  const handleRedo = () => {
    if (!redoStack.length) return;
    const next = redoStack[redoStack.length - 1];
    setRedoStack((s) => s.slice(0, -1));
    setUndoStack((s) => [...s, currentStrokes]);
    applyStrokes(next, false);
  };
  const handleClearAll = () => applyStrokes([], true);

  // ── 캔버스 오브젝트 ────────────────────────────────────
  const addCanvasObject = async (type: CanvasObjectType, label: string, extra?: { poseKey?: DoctorPoseKey; width?: number; height?: number }) => {
    if (!project || !selectedId) return;
    const offset = currentCanvasObjects.length * 0.03;
    const response = await fetch(`/api/youtube-editing/segments/${selectedId}/canvas-objects`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projectId: project.id, type, label, x: 0.08 + offset, y: 0.08 + offset,
        width: extra?.width, height: extra?.height, poseKey: extra?.poseKey,
      }),
    });
    const data = await response.json();
    if (!data.ok) return;
    setCanvasObjectsBySegment((prev) => ({ ...prev, [selectedId]: [...(prev[selectedId] ?? []), data.canvasObject] }));
    setSelectedObjectId(data.canvasObject.id);
  };

  const insertShape = () => addCanvasObject("rect", "도형");
  const insertText = () => addCanvasObject("text", "텍스트");
  const insertImage = () => addCanvasObject("image_thumb", "이미지 자료");
  const selectDoctorPose = (poseKey: DoctorPoseKey) => {
    void addCanvasObject("doctor_pose", "원장 포즈", { poseKey, width: 0.16, height: 0.28 });
    setPosePopupOpen(false);
  };

  const updateCanvasObject = (id: string, patch: Partial<CanvasObjectData>) => {
    if (!selectedId) return;
    setCanvasObjectsBySegment((prev) => ({
      ...prev,
      [selectedId]: (prev[selectedId] ?? []).map((o) => (o.id === id ? { ...o, ...patch } : o)),
    }));
    scheduleSave(`canvas-object:${id}`, () => {
      void fetch(`/api/youtube-editing/canvas-objects/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
    });
  };

  const deleteCanvasObject = (id: string) => {
    if (!selectedId) return;
    setCanvasObjectsBySegment((prev) => ({ ...prev, [selectedId]: (prev[selectedId] ?? []).filter((o) => o.id !== id) }));
    if (selectedObjectId === id) setSelectedObjectId(null);
    void fetch(`/api/youtube-editing/canvas-objects/${id}`, { method: "DELETE" });
  };

  // ── 이미지 프롬프트 생성 (기존 B-roll API 연결) ─────────
  const generatePrompt = async () => {
    if (!selectedSegment || !project || generatingPrompt) return;
    const targetSnippet = selectedSegment.visual.description.trim();
    if (!targetSnippet) return;
    setGeneratingPrompt(true);
    setPromptResult("");
    try {
      const response = await fetch("/api/broll-prompt-generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullScript: project.fullScript,
          targetSnippet,
          style: VISUAL_STYLE_TO_PROMPT_PRESET[selectedSegment.visual.style],
        }),
      });
      const data = await response.json();
      if (!data.ok) throw new Error(data.error);
      setPromptResult(data.prompt);
      await navigator.clipboard.writeText(data.prompt).catch(() => {});
    } catch (error) {
      setPromptResult(error instanceof Error ? `오류: ${error.message}` : "프롬프트 생성에 실패했습니다.");
    } finally {
      setGeneratingPrompt(false);
    }
  };

  // ── AI 전체 분석 ───────────────────────────────────────
  const runAiAnalysis = async () => {
    if (!project || analyzing) return;
    setAnalyzing(true);
    try {
      const response = await fetch("/api/youtube-editing-analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: project.title, hospitalName: project.hospitalName ?? undefined,
          fullScript: project.fullScript, videoRatio: project.videoRatio, preferredTone: project.preferredTone ?? undefined,
        }),
      });
      const data = await response.json();
      if (!data.ok) throw new Error(data.error);
      // 사용자가 이미 손댄(userModified) 문장은 절대 덮어쓰지 않는다 — 아직 손대지 않은 빈 문장에만
      // AI 추천을 초안으로 채워 넣는다. 손댄 문장은 추천 이유만 참고용으로 저장한다.
      await Promise.all(data.segments.map(async (suggestion: any, index: number) => {
        const target = segments[index];
        if (!target) return;
        const patch: Partial<Segment> = { aiReason: suggestion.aiReason ?? null, confidence: suggestion.confidence ?? null };
        if (!target.userModified) {
          Object.assign(patch, {
            camera: suggestion.camera, caption: suggestion.caption, visual: suggestion.visual,
            soundEffect: suggestion.soundEffect, transition: suggestion.transition, template: suggestion.template,
            editingNote: suggestion.editingNote, estimatedDurationSec: suggestion.estimatedDurationSec,
          });
        }
        setSegments((prev) => prev.map((s) => (s.id === target.id ? { ...s, ...patch } : s)));
        await fetch(`/api/youtube-editing/segments/${target.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patch),
        });
      }));
    } catch (error) {
      setBootstrapError(error instanceof Error ? error.message : "AI 분석에 실패했습니다.");
    } finally {
      setAnalyzing(false);
    }
  };

  // 원장 포즈 6종 선화 이미지를 한 번 생성해 고정 경로에 저장한다(재실행하면 같은 경로에 덮어씀).
  const generateDoctorPoseImages = async () => {
    if (generatingPoses) return;
    setGeneratingPoses(true);
    setPoseGenMessage("포즈 이미지 생성 중... (1분 정도 걸릴 수 있어요)");
    try {
      const response = await fetch("/api/youtube-editing/doctor-poses/generate", { method: "POST" });
      const data = await response.json();
      if (!data.ok) throw new Error(data.error || "일부 포즈 생성에 실패했습니다.");
      setPoseGenMessage("포즈 이미지 생성 완료!");
    } catch (error) {
      setPoseGenMessage(error instanceof Error ? error.message : "포즈 이미지 생성에 실패했습니다.");
    } finally {
      setGeneratingPoses(false);
      setTimeout(() => setPoseGenMessage(""), 4000);
    }
  };

  // 전체화면 — 가능하면 브라우저 전체화면 API도 함께 요청하지만(iPad Safari 등 미지원 환경에서는
  // 조용히 무시된다), 핵심은 헤더/하단 장면 미리보기를 감춰 캔버스에 화면을 최대한 내주는 것이다.
  const toggleZenMode = async () => {
    const next = !zenMode;
    setZenMode(next);
    setScriptDrawerOpen(false);
    setToolsDrawerOpen(false);
    try {
      if (next && mainRef.current && !document.fullscreenElement) {
        await mainRef.current.requestFullscreen?.();
      } else if (!next && document.fullscreenElement) {
        await document.exitFullscreen?.();
      }
    } catch {
      // 전체화면 API 미지원 브라우저 — 인앱 전체화면 모드만 적용된 채로 계속 진행한다.
    }
  };

  if (loading) {
    return <main className="pc-page" style={{ display: "grid", placeItems: "center", minHeight: "60vh", color: C.muted }}>불러오는 중...</main>;
  }

  if (!project) {
    // ?project= 로 특정 문서를 열려다 실패한 경우
    if (projectIdParam) {
      return (
        <main className="pc-page" style={{ color: C.ink, fontFamily: "'NanumSquare', 'Noto Sans KR', sans-serif" }}>
          <div className="pc-content" style={{ maxWidth: 480 }}>
            <p style={{ color: C.danger, fontSize: 13, marginBottom: 14 }}>{bootstrapError || "문서를 불러오지 못했습니다."}</p>
            <Link href="/youtube-editing-conti" className="pc-btn pc-btn--secondary pc-btn--sm">문서 목록으로</Link>
          </div>
        </main>
      );
    }
    // 첫 진입 — 저장된 문서 목록 (예전처럼 최근 문서로 자동 이동하지 않는다)
    return (
      <main className="pc-page" style={{ color: C.ink, fontFamily: "'NanumSquare', 'Noto Sans KR', sans-serif" }}>
        <div className="pc-content">
          <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 18 }}>
            <div>
              <h1 style={{ fontSize: 20, fontWeight: 800, marginBottom: 6 }}>유튜브 편집 콘티</h1>
              <p style={{ fontSize: 13, color: C.muted, margin: 0 }}>저장된 문서를 열거나 새 문서를 시작하세요.</p>
            </div>
            <Link
              href="/youtube-editing-conti/new"
              className="pc-btn pc-btn--primary pc-btn--sm"
              style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "0 16px", height: 38, borderRadius: R.md, background: C.orange, color: "#fff", fontSize: 13, fontWeight: 800, textDecoration: "none" }}
            >
              <Plus size={15} />새 프로젝트
            </Link>
          </div>
          {bootstrapError ? <p style={{ color: C.danger, fontSize: 12, marginBottom: 14 }}>{bootstrapError}</p> : null}
          {projectList.length === 0 ? (
            <div className="pc-card pc-card--padded" style={{ textAlign: "center", padding: 36 }}>
              <p style={{ fontSize: 13, color: C.muted, marginBottom: 14 }}>아직 저장된 문서가 없습니다.</p>
              <Link href="/youtube-editing-conti/new" style={{ fontSize: 13, fontWeight: 800, color: C.orange }}>+ 새 프로젝트 시작하기</Link>
            </div>
          ) : (
            <div style={{ display: "grid", gap: 10 }}>
              {projectList.map((item) => (
                <Link
                  key={item.id}
                  href={`/youtube-editing-conti?project=${item.id}`}
                  className="pc-card pc-card--padded"
                  style={{ display: "flex", alignItems: "center", justifyContent: "space-between", textDecoration: "none", color: "inherit" }}
                >
                  <div style={{ minWidth: 0 }}>
                    <strong style={{ fontSize: 14, color: C.ink, display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.title}</strong>
                    <span style={{ fontSize: 11, color: C.hint }}>{item.segmentCount}문장 · {relativeTime(item.updated_at)} 저장됨</span>
                  </div>
                  <ChevronRight size={16} color={C.hint} style={{ flexShrink: 0 }} />
                </Link>
              ))}
            </div>
          )}
        </div>
      </main>
    );
  }

  return (
    <main ref={mainRef} style={{ height: "100dvh", display: "flex", flexDirection: "column", overflow: "hidden", background: C.bg, color: C.ink, fontFamily: "'NanumSquare', 'Noto Sans KR', sans-serif" }}>
      {/* 헤더 — 전체화면 모드에서는 숨기고 캔버스 위에 떠 있는 종료 버튼만 보여준다 */}
      {zenMode ? (
        <button
          type="button"
          onClick={toggleZenMode}
          aria-label="전체화면 종료"
          style={{
            position: "fixed", top: 10, right: 10, zIndex: 250, display: "inline-flex", alignItems: "center", gap: 6,
            height: 34, padding: "0 12px", borderRadius: R.md, border: `1px solid ${C.border}`, background: "rgba(255,255,255,.96)",
            color: C.ink, fontSize: 11.5, fontWeight: 800, cursor: "pointer", boxShadow: "0 8px 20px rgba(0,0,0,.18)",
          }}
        >
          <Minimize2 size={14} />전체화면 종료
        </button>
      ) : (
      <header style={{
        display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "10px 20px",
        background: "#fff", borderBottom: `1px solid ${C.border}`, flexShrink: 0,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
          <span style={{ fontSize: 14, fontWeight: 900, color: C.teal, flexShrink: 0 }}>유튜브 편집 콘티 분석기</span>
          <SaveStatus state={saveState} />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0, position: "relative" }}>
          <HeaderButton onClick={runAiAnalysis} disabled={analyzing} primary>
            <Sparkles size={13} />{analyzing ? "분석 중..." : "AI 전체 분석"}
          </HeaderButton>
          <HeaderButton onClick={() => exportProjectJson(project, segments)}>JSON 내보내기</HeaderButton>
          <HeaderButton onClick={() => printProjectSummary(project, segments)}>PDF 내보내기</HeaderButton>
          <button type="button" onClick={toggleZenMode} aria-label="전체화면"
            style={{ width: 32, height: 32, borderRadius: R.sm, border: `1px solid ${C.border}`, background: "#fff", color: C.muted, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
            <Maximize2 size={15} />
          </button>
          <button type="button" onClick={() => setMoreOpen((v) => !v)} aria-label="더보기"
            style={{ width: 32, height: 32, borderRadius: R.sm, border: `1px solid ${C.border}`, background: "#fff", color: C.muted, cursor: "pointer" }}>
            <MoreVertical size={15} />
          </button>
          {moreOpen ? (
            <div style={{ position: "absolute", top: "calc(100% + 6px)", right: 0, background: "#fff", border: `1px solid ${C.border}`, borderRadius: R.md, boxShadow: "0 8px 24px rgba(21,88,85,.12)", zIndex: 30, minWidth: 200 }}>
              <button type="button" onClick={() => { setMoreOpen(false); router.push("/youtube-editing-conti"); }}
                style={{ display: "block", width: "100%", textAlign: "left", padding: "10px 14px", border: 0, background: "transparent", fontSize: 12, color: C.ink, cursor: "pointer" }}>
                📄 저장된 문서 목록
              </button>
              <button type="button" onClick={() => { setMoreOpen(false); router.push("/youtube-editing-conti/new"); }}
                style={{ display: "block", width: "100%", textAlign: "left", padding: "10px 14px", border: 0, background: "transparent", fontSize: 12, color: C.ink, cursor: "pointer" }}>
                + 새 프로젝트 시작
              </button>
              <button type="button" disabled={generatingPoses} onClick={() => { setMoreOpen(false); void generateDoctorPoseImages(); }}
                style={{ display: "block", width: "100%", textAlign: "left", padding: "10px 14px", border: 0, borderTop: `1px solid ${C.border}`, background: "transparent", fontSize: 12, color: C.muted, cursor: generatingPoses ? "not-allowed" : "pointer" }}>
                {generatingPoses ? "포즈 이미지 생성 중..." : "🩺 원장 포즈 이미지 생성/재생성"}
              </button>
            </div>
          ) : null}
          {poseGenMessage ? (
            <div style={{ position: "absolute", top: "calc(100% + 6px)", right: 0, background: C.ink, color: "#fff", borderRadius: R.sm, padding: "8px 12px", fontSize: 11, zIndex: 31, whiteSpace: "nowrap" }}>
              {poseGenMessage}
            </div>
          ) : null}
        </div>
      </header>
      )}

      {/* 본문 — 좌측 대본은 위아래 전체를 차지하고, 우측 상단(가운데+도구)과 우측 하단(툴바)으로 나뉜다.
          전체가 뷰포트 안에 고정되고 각 패널 내부만 스크롤된다. */}
      <div className="yec-layout" style={{
        flex: 1, minHeight: 0, display: "grid",
        gridTemplateColumns: "21% 53% 26%",
        gridTemplateRows: "1fr auto",
        gridTemplateAreas: `"script center tools" "script toolbar toolbar"`,
        gap: 12, padding: "12px 16px 0",
      }}>
        {/* 좁은 화면(아이패드 등)에서만 보이는 엣지 탭 — 문장 목록/편집 도구를 서랍으로 열고 닫는다 */}
        <button type="button" className="yec-edge-tab yec-edge-tab--left" onClick={() => setScriptDrawerOpen((v) => !v)} aria-label="문장 목록 열기"
          style={{ display: "none", position: "fixed", top: "50%", left: 0, transform: "translateY(-50%)", zIndex: 150, width: 28, height: 60, border: `1px solid ${C.border}`, borderLeft: "none", borderRadius: "0 10px 10px 0", background: "#fff", color: C.teal, alignItems: "center", justifyContent: "center", cursor: "pointer", boxShadow: "0 4px 14px rgba(21,88,85,.14)" }}>
          <List size={15} />
        </button>
        <button type="button" className="yec-edge-tab yec-edge-tab--right" onClick={() => setToolsDrawerOpen((v) => !v)} aria-label="편집 도구 열기"
          style={{ display: "none", position: "fixed", top: "50%", right: 0, transform: "translateY(-50%)", zIndex: 150, width: 28, height: 60, border: `1px solid ${C.border}`, borderRight: "none", borderRadius: "10px 0 0 10px", background: "#fff", color: C.teal, alignItems: "center", justifyContent: "center", cursor: "pointer", boxShadow: "0 4px 14px rgba(21,88,85,.14)" }}>
          <Wrench size={15} />
        </button>
        {scriptDrawerOpen || toolsDrawerOpen ? (
          <div className="yec-drawer-backdrop" onClick={() => { setScriptDrawerOpen(false); setToolsDrawerOpen(false); }}
            style={{ display: "none", position: "fixed", inset: 0, background: "rgba(0,0,0,.35)", zIndex: 190 }} />
        ) : null}

        <div className={`pc-card pc-card--padded yec-panel yec-panel--script${scriptDrawerOpen ? " yec-drawer-open" : ""}`} style={{ gridArea: "script", minHeight: 0, overflow: "hidden", display: "flex", flexDirection: "column" }}>
          <div className="yec-drawer-header" style={{ display: "none", alignItems: "center", justifyContent: "space-between", paddingBottom: 8, marginBottom: 8, borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
            <span style={{ fontSize: 12.5, fontWeight: 800, color: C.ink }}>문장 목록</span>
            <button type="button" onClick={() => setScriptDrawerOpen(false)} aria-label="닫기" style={{ width: 26, height: 26, borderRadius: R.sm, border: `1px solid ${C.border}`, background: "#fff", color: C.muted, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
              <X size={14} />
            </button>
          </div>
          <div style={{ flex: 1, minHeight: 0 }}>
          <ScriptPanel
            segments={segments}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onAddSegment={addSegment}
            onDeleteSegment={deleteSegment}
            onMoveSegment={moveSegment}
            onDuplicateSegment={duplicateSegment}
            onSplitSegment={splitSegment}
            onMergeNext={mergeNext}
            hasAnnotation={(id) => (annotationsBySegment[id]?.strokes.length ?? 0) > 0}
          />
          </div>
        </div>

        <div className="pc-card pc-card--padded yec-panel" style={{ gridArea: "center", minHeight: 0, overflow: "hidden", display: "flex", flexDirection: "column" }}>
          {selectedSegment ? (
            <>
              <div style={{ flexShrink: 0 }}>
                <CurrentSegmentHeader
                  segment={selectedSegment}
                  index={selectedIndex}
                  total={segments.length}
                  onTextChange={(text) => updateSegment(selectedSegment.id, { scriptText: text })}
                  onSplit={() => splitSegment(selectedSegment.id)}
                  onDelete={() => deleteSegment(selectedSegment.id)}
                />
              </div>
              <div ref={optionsBarRef} style={{ flexShrink: 0 }}>
                <OptionsSummaryBar
                  segment={selectedSegment}
                  expanded={optionsExpanded}
                  onToggle={() => setOptionsExpanded((v) => !v)}
                />
                {/* 부모(.pc-card)가 overflow:hidden이라 absolute로 띄우면 잘리므로 body에 포털로 렌더링하고
                    fixed 좌표로 직접 위치를 잡는다. */}
                {optionsExpanded && optionsBarRect ? createPortal(
                  <>
                    <div onClick={() => setOptionsExpanded(false)} style={{ position: "fixed", inset: 0, zIndex: 140 }} />
                    <div style={{
                      position: "fixed", top: optionsBarRect.bottom + 6, left: optionsBarRect.left, width: optionsBarRect.width, zIndex: 141,
                      background: "#fff", border: `1px solid ${C.border}`, borderRadius: R.md,
                      boxShadow: "0 16px 40px rgba(21,88,85,.16)", padding: 12, maxHeight: "60vh", overflowY: "auto",
                    }}>
                      <QuickOptionCards
                        segment={selectedSegment}
                        onUpdate={(patch) => updateSegment(selectedSegment.id, patch)}
                        onGeneratePrompt={generatePrompt}
                        generatingPrompt={generatingPrompt}
                      />
                    </div>
                  </>,
                  document.body,
                ) : null}
                {promptResult ? (
                  <div style={{ marginTop: 8, padding: 10, borderRadius: R.sm, background: C.ink, color: "#EAF4F2", fontFamily: "monospace", fontSize: 11, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>
                    {promptResult}
                  </div>
                ) : null}
              </div>

              <div className="yec-mobile-hint" style={{ display: "none", flexShrink: 0, marginTop: 10, padding: 10, borderRadius: R.sm, background: "#FFF7ED", color: C.orange, fontSize: 11.5, fontWeight: 700 }}>
                손글씨 편집은 태블릿 또는 데스크톱에서 이용해주세요. 이 화면에서는 읽기와 간단한 선택만 지원합니다.
              </div>

              {/* 손글씨 콘티 캔버스 — 항상 가장 넓은 공간을 차지하도록 flex:1 */}
              <div
                ref={canvasContainerRef}
                style={{
                  flex: 1, minHeight: 140, marginTop: 10, borderRadius: R.md, border: `1px solid ${C.border}`,
                  background: "repeating-linear-gradient(0deg, #fff, #fff 23px, #F3F1EC 24px), repeating-linear-gradient(90deg, #fff, #fff 23px, #F3F1EC 24px)",
                  position: "relative", overflow: "hidden", transform: `scale(${zoom / 100})`, transformOrigin: "center center",
                }}
              >
                <StoryboardCanvas
                  key={selectedSegment.id}
                  strokes={currentStrokes}
                  tool={tool} color={color} width={strokeWidth}
                  onStrokeCommit={handleStrokeCommit}
                  onEraseStrokes={handleEraseStrokes}
                >
                  {currentCanvasObjects.map((object) => (
                    <CanvasObject
                      key={object.id}
                      object={object}
                      containerRef={canvasContainerRef}
                      selected={object.id === selectedObjectId}
                      onSelect={setSelectedObjectId}
                      onMove={(id, x, y) => updateCanvasObject(id, { x, y })}
                      onDelete={deleteCanvasObject}
                    />
                  ))}
                </StoryboardCanvas>
              </div>
            </>
          ) : (
            <p style={{ fontSize: 12, color: C.hint }}>왼쪽에서 문장을 선택하세요.</p>
          )}
        </div>

        <div className={`pc-card pc-card--padded yec-panel yec-panel--tools${toolsDrawerOpen ? " yec-drawer-open" : ""}`} style={{ gridArea: "tools", minHeight: 0, overflow: "hidden", display: "flex", flexDirection: "column" }}>
          <div className="yec-drawer-header" style={{ display: "none", alignItems: "center", justifyContent: "space-between", paddingBottom: 8, marginBottom: 8, borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
            <span style={{ fontSize: 12.5, fontWeight: 800, color: C.ink }}>편집 도구</span>
            <button type="button" onClick={() => setToolsDrawerOpen(false)} aria-label="닫기" style={{ width: 26, height: 26, borderRadius: R.sm, border: `1px solid ${C.border}`, background: "#fff", color: C.muted, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
              <X size={14} />
            </button>
          </div>
          <div style={{ flex: 1, minHeight: 0, overflow: "hidden", display: "flex", flexDirection: "column" }}>
          {selectedSegment ? (
            <EditToolsPanel
              segment={selectedSegment}
              onUpdate={(patch) => updateSegment(selectedSegment.id, patch)}
              onAddCanvasObject={addCanvasObject}
              selectedObject={selectedObject}
              onUpdateObject={updateCanvasObject}
              onDeleteObject={deleteCanvasObject}
              onGeneratePrompt={generatePrompt}
              generatingPrompt={generatingPrompt}
            />
          ) : (
            <p style={{ fontSize: 12, color: C.hint }}>문장을 선택하면 편집 도구가 활성화됩니다.</p>
          )}
          </div>
        </div>

        {/* 하단 통합 툴바 — 가운데+도구 패널 아래에 걸쳐 있고, 원장 포즈 팝업이 이 바로 위에 뜬다.
            .pc-card 기본값이 overflow:hidden이라 카드 위로 튀어나오는 팝업이 잘리므로 visible로 덮어쓴다. */}
        <div className="pc-card" style={{ gridArea: "toolbar", position: "relative", minHeight: 0, overflow: "visible" }}>
          <DoctorPosePopup
            open={posePopupOpen}
            onClose={() => setPosePopupOpen(false)}
            onSelect={selectDoctorPose}
            selectedPoseKey={selectedObject?.poseKey}
          />
          <DrawingToolbar
            tool={tool} onToolChange={(next) => { setTool(next); setPosePopupOpen(false); }}
            color={color} onColorChange={setColor}
            width={strokeWidth} onWidthChange={setStrokeWidth}
            canUndo={undoStack.length > 0} canRedo={redoStack.length > 0}
            onUndo={handleUndo} onRedo={handleRedo} onClear={handleClearAll}
            onInsertShape={insertShape} onInsertText={insertText} onInsertImage={insertImage}
            onOpenPosePopup={() => setPosePopupOpen((v) => !v)} posePopupOpen={posePopupOpen}
            onExportPdf={() => printProjectSummary(project, segments)}
          />
        </div>
      </div>

      {/* 하단 전체 장면 미리보기 + 보기 옵션 — 좁은 화면(아이패드 등)과 전체화면 모드에서는 감춰
          캔버스(메모 공간)에 그만큼의 세로 공간을 더 준다. 장면 이동은 좌측 서랍(문장 목록)으로 대체된다. */}
      {!zenMode ? (
      <div className="yec-footer-row" style={{ flexShrink: 0, display: "flex", gap: 12, alignItems: "stretch", padding: "10px 16px 14px" }}>
        <div className="pc-card pc-card--padded" style={{ flex: 1, minWidth: 0 }}>
          <SegmentTimeline segments={segments} selectedId={selectedId} onSelect={setSelectedId} />
        </div>
        <div className="pc-card pc-card--padded" style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 10 }}>
          <div>
            <div style={{ fontSize: 9.5, color: C.hint, fontWeight: 700, marginBottom: 3 }}>보기 옵션</div>
            <select defaultValue="simple" style={{ height: 30, borderRadius: R.sm, border: `1px solid ${C.border}`, fontSize: 11.5, padding: "0 8px" }}>
              <option value="simple">간단 모드</option>
            </select>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <button type="button" onClick={() => setZoom((z) => Math.max(50, z - 10))} aria-label="축소"
              style={{ width: 26, height: 26, borderRadius: 6, border: `1px solid ${C.border}`, background: "#fff", cursor: "pointer" }}>-</button>
            <span style={{ fontSize: 11.5, fontWeight: 700, color: C.ink, width: 38, textAlign: "center" }}>{zoom}%</span>
            <button type="button" onClick={() => setZoom((z) => Math.min(150, z + 10))} aria-label="확대"
              style={{ width: 26, height: 26, borderRadius: 6, border: `1px solid ${C.border}`, background: "#fff", cursor: "pointer" }}>+</button>
          </div>
        </div>
      </div>

      <style jsx global>{`
        /* 기본값(1181px 이상, 아이패드 12.9인치 가로 1366px 포함)은 21/53/26 비율을 유지한다. */
        @media (max-width: 1180px) {
          /* 아이패드 가로보다 좁은 화면 — 3열은 유지하되 오른쪽 도구 패널 폭만 줄인다. */
          .yec-layout { grid-template-columns: 24% 50% 26% !important; }
        }
        @media (max-width: 900px) {
          /* 아이패드 세로 이하 — 캔버스를 가장 크게 유지하며 세로로 쌓는다. */
          .yec-layout {
            grid-template-columns: 1fr !important;
            grid-template-rows: auto auto auto auto !important;
            grid-template-areas: "script" "center" "tools" "toolbar" !important;
            overflow-y: auto !important;
          }
          .yec-panel { min-height: 320px !important; }
        }
        @media (max-width: 640px) {
          .yec-mobile-hint { display: block !important; }
        }
      `}</style>
    </main>
  );
}

function HeaderButton({ children, onClick, disabled, primary }: { children: React.ReactNode; onClick: () => void; disabled?: boolean; primary?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        display: "inline-flex", alignItems: "center", gap: 5, height: 32, padding: "0 12px", borderRadius: R.sm,
        border: `1px solid ${primary ? "#2563EB" : C.border}`, background: primary ? "#EEF3FF" : "#fff",
        color: primary ? "#2563EB" : C.ink, fontSize: 11.5, fontWeight: 800,
        cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.6 : 1, whiteSpace: "nowrap",
      }}
    >
      {children}
    </button>
  );
}
