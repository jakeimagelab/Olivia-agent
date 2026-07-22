"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import {
  FlipHorizontal, FlipVertical, Play, Pause, RotateCcw,
  Circle, Square, Save, Type, Gauge, X, Trash2, Plus,
  AlignLeft, AlignCenter, AlignRight,
  AlignVerticalJustifyStart, AlignVerticalJustifyCenter, AlignVerticalJustifyEnd,
  Smartphone, FileText, Rows3, ChevronUp, ChevronDown, ChevronLeft, ChevronRight,
  Building2, Pencil, AlignVerticalSpaceAround, Maximize, Minimize, GripVertical, Users, Sparkles,
  Clock3, Scan, Palette, AlignVerticalDistributeCenter,
} from "lucide-react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import PageHeader from "@/components/PageHeader";
import { getSupabase } from "@/lib/supabase";
import { FONT_OPTIONS, COLOR_OPTIONS, BG_COLOR_OPTIONS, V_ALIGN_PADDING, fmtTime, type HAlign, type VAlign } from "@/lib/prompter/constants";

type Speaker = { id: string; name: string; color: string };
type Project = { id: string; name: string; sceneCount: number; lastActivity: string; updated_at: string; speakers?: Speaker[] };
type Scene = { id: string; title: string; subject?: string; content: string; editor_mode?: "text" | "slides"; speaker_map?: string[]; updated_at: string };

const SPEAKER_PALETTE = ["#E85D2C", "#155855", "#EB8F22", "#7C3AED", "#2563EB", "#569082"];

type AiIssue = { type: "spelling" | "naturalness"; original: string; suggestion: string; reason: string };

// 문단(빈 줄로 구분)과 화자 배정을 함께 정리한다 — 진짜 빈 문단(카드만 만들고 아직
// 안 쓴 문단 등)은 실행화면·저장 데이터 모두에서 걸러내고, 화자 배정도 같이 맞춰 당겨준다.
function getCleanParagraphs(text: string, speakerMap: string[]): { paragraphs: string[]; speakerMap: string[] } {
  const raw = text.split(/\n\s*\n/);
  const paragraphs: string[] = [];
  const map: string[] = [];
  raw.forEach((p, i) => {
    if (p.trim().length === 0) return;
    paragraphs.push(p);
    map.push(speakerMap[i] ?? "");
  });
  return { paragraphs, speakerMap: map };
}

// Chrome은 vp9가 안정적이지만 지원하지 않는 브라우저(구형 Chrome, 일부 Safari)에서
// new MediaRecorder(...)가 바로 예외를 던지지 않도록 지원 코덱을 순서대로 확인한다.
function pickSupportedMimeType(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  const candidates = ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"];
  return candidates.find((t) => MediaRecorder.isTypeSupported?.(t));
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString("ko-KR");
}

export default function PrompterPage() {
  const [mode, setMode] = useState<"projects" | "scenes" | "prompt">("projects");

  // 프로젝트(병원/기업 단위)
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(true);
  const [currentProject, setCurrentProject] = useState<Project | null>(null);
  const [showProjectModal, setShowProjectModal] = useState(false);
  const [projectModalMode, setProjectModalMode] = useState<"create" | "rename">("create");
  const [projectNameInput, setProjectNameInput] = useState("");
  const [savingProject, setSavingProject] = useState(false);

  // 씬(프로젝트에 속한 개별 촬영 대본)
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [scenesLoading, setScenesLoading] = useState(false);
  const [text, setText] = useState("");
  const [title, setTitle] = useState("");
  const [subject, setSubject] = useState("");
  const [editorMode, setEditorMode] = useState<"text" | "slides">("text");
  const [sceneId, setSceneId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [lastAutoSavedAt, setLastAutoSavedAt] = useState<number | null>(null);
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const skipNextAutoSaveRef = useRef(false);

  // 다중 화자 — 프로젝트 단위 화자 목록 + 씬(대본)의 문단별 화자 배정
  const [speakers, setSpeakers] = useState<Speaker[]>([]);
  const [multiSpeakerMode, setMultiSpeakerMode] = useState(false);
  const [speakerMap, setSpeakerMap] = useState<string[]>([]);
  useEffect(() => { setSpeakers(currentProject?.speakers ?? []); }, [currentProject?.id]);

  // AI 검토 — 맞춤법 / 자연스러운 표현
  const [aiReviewOpen, setAiReviewOpen] = useState(false);
  const [aiReviewLoading, setAiReviewLoading] = useState(false);
  const [aiIssues, setAiIssues] = useState<AiIssue[]>([]);

  // 모바일에서는 실행 화면(큰 화면 낭독용)이 아니라 리모컨 용도로만 쓴다.
  const [isMobile, setIsMobile] = useState(false);
  const [showMobileBlocked, setShowMobileBlocked] = useState(false);
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  // 프롬프터(실행) 설정
  const [flipH, setFlipH] = useState(false);
  const [flipV, setFlipV] = useState(false);
  const [fontSize, setFontSize] = useState(48);
  const [fontColor, setFontColor] = useState("#FFFFFF");
  const [fontFamily, setFontFamily] = useState(FONT_OPTIONS[0].value);
  const [bgColor, setBgColor] = useState("#000000");
  const [lineHeight, setLineHeight] = useState(1.7);
  const [hAlign, setHAlign] = useState<HAlign>("left");
  const [vAlign, setVAlign] = useState<VAlign>("center");
  const [speed, setSpeed] = useState(40); // px/sec
  const [paragraphSpacing, setParagraphSpacing] = useState(28); // px — 문단(빈 줄로 구분된 덩어리) 사이 간격
  const [scrolling, setScrolling] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [showControls, setShowControls] = useState(true);
  const [slideIndex, setSlideIndex] = useState(0);

  // 카운트다운 (3-2-1) — 재생 즉시 스크롤이 시작되지 않고, "레디, 액션" 사이 첫 줄을 놓치지 않게 한다.
  const [countdown, setCountdown] = useState<number | null>(null);
  const [countdownEnabled, setCountdownEnabled] = useState(true);
  const countdownTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 중앙 포커스 가이드라인
  const [guideEnabled, setGuideEnabled] = useState(false);
  const [guidePosition, setGuidePosition] = useState(40); // 화면 세로 위치 %
  const [guideHighlight, setGuideHighlight] = useState(false);
  const [focusedParagraphIndex, setFocusedParagraphIndex] = useState<number | null>(null);

  // 녹화
  const [recording, setRecording] = useState(false);
  const [recordedUrl, setRecordedUrl] = useState<string | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const videoPreviewRef = useRef<HTMLVideoElement>(null);

  // 리모컨
  const [sessionCode, setSessionCode] = useState<string | null>(null);
  const [showRemoteInfo, setShowRemoteInfo] = useState(false);
  const channelRef = useRef<RealtimeChannel | null>(null);

  // 전체화면 (태블릿에서 흰색 브라우저 주소창이 거슬리지 않도록) —
  // 화면을 손으로 터치해서 스크롤을 움직이다가 시스템 제스처로 전체화면이 풀려도,
  // "전체화면 종료" 버튼을 누른 게 아니라면 곧바로(또는 다음 터치 시) 다시 전체화면으로 되돌린다.
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [intentionallyOutOfFullscreen, setIntentionallyOutOfFullscreen] = useState(false);
  const promptRootRef = useRef<HTMLDivElement>(null);
  const intentionalExitRef = useRef(false);
  useEffect(() => {
    const onChange = () => {
      const fs = Boolean(document.fullscreenElement);
      setIsFullscreen(fs);
      if (fs) {
        setIntentionallyOutOfFullscreen(false);
      } else if (intentionalExitRef.current) {
        setIntentionallyOutOfFullscreen(true);
      } else {
        // 버튼이 아닌 다른 이유로 풀렸다 — 바로 재시도 (브라우저 정책으로 실패하면
        // 아래 다음-터치 폴백이 이어서 재시도한다).
        promptRootRef.current?.requestFullscreen().catch(() => {});
      }
      intentionalExitRef.current = false;
    };
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);
  // 위 즉시 재요청이 "사용자 제스처 유지시간" 정책으로 조용히 실패할 수 있어,
  // 버튼으로 나간 게 아닌데 여전히 전체화면이 아니면 다음 터치 때 한 번 더 시도한다.
  // 단, 버튼/입력 등 조작 UI를 누른 것까지 여기에 걸리면 재생 버튼을 누르자마자
  // 전체화면 진입으로 화면 크기가 바뀌면서 스크롤이 튀어 보이므로, 실제 화면(텍스트) 영역을
  // 직접 터치했을 때만 재시도한다.
  useEffect(() => {
    if (mode !== "prompt" || isFullscreen || intentionallyOutOfFullscreen) return;
    const root = promptRootRef.current;
    if (!root) return;
    const retry = (e: PointerEvent) => {
      if (e.target instanceof Element && e.target.closest("button, select, input, a")) return;
      root.requestFullscreen().catch(() => {});
    };
    root.addEventListener("pointerdown", retry);
    return () => root.removeEventListener("pointerdown", retry);
  }, [mode, isFullscreen, intentionallyOutOfFullscreen]);
  const toggleFullscreen = () => {
    if (document.fullscreenElement) {
      intentionalExitRef.current = true;
      document.exitFullscreen().catch(() => { intentionalExitRef.current = false; });
    } else {
      setIntentionallyOutOfFullscreen(false);
      promptRootRef.current?.requestFullscreen().catch(() => {});
    }
  };

  const scrollBoxRef = useRef<HTMLDivElement>(null);
  const lastParagraphRef = useRef<HTMLDivElement>(null);
  const paragraphRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [paragraphIndex, setParagraphIndex] = useState(0);
  const paragraphIndexRef = useRef(0);
  useEffect(() => { paragraphIndexRef.current = paragraphIndex; }, [paragraphIndex]);
  const rafRef = useRef<number | null>(null);
  const lastTsRef = useRef<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const slides = text.split("\n");
  const { paragraphs, speakerMap: playbackSpeakerMap } = getCleanParagraphs(text, speakerMap);
  // 편집 중(다중 화자 카드 목록)에는 방금 추가한 빈 문단 카드도 보여야 하므로 필터링 없이 그대로 쓴다.
  const editParagraphs = text.split(/\n\s*\n/);

  /* ── 프로젝트 목록 ── */
  const loadProjects = useCallback(async () => {
    setProjectsLoading(true);
    try {
      const res = await fetch("/api/prompter-projects").then((r) => r.json());
      setProjects(res.projects ?? []);
    } finally {
      setProjectsLoading(false);
    }
  }, []);
  useEffect(() => { loadProjects(); }, [loadProjects]);

  const openProjectModal = (m: "create" | "rename") => {
    setProjectModalMode(m);
    setProjectNameInput(m === "rename" ? currentProject?.name ?? "" : "");
    setShowProjectModal(true);
  };
  const submitProjectModal = async () => {
    const name = projectNameInput.trim();
    if (!name || savingProject) return;
    setSavingProject(true);
    try {
      const res = await fetch("/api/prompter-projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(projectModalMode === "rename" ? { id: currentProject?.id, name } : { name }),
      }).then((r) => r.json());
      if (!res.ok) { alert(res.error || "저장에 실패했습니다."); return; }
      setShowProjectModal(false);
      await loadProjects();
      if (projectModalMode === "create") {
        openProject(res.project);
      } else {
        setCurrentProject(res.project);
      }
    } finally {
      setSavingProject(false);
    }
  };
  const deleteProject = async (p: Project, e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (!confirm(`"${p.name}" 프로젝트와 소속된 씬 ${p.sceneCount}개가 모두 삭제됩니다. 계속할까요?`)) return;
    const res = await fetch(`/api/prompter-projects/${p.id}`, { method: "DELETE" }).then((r) => r.json());
    if (res.ok) setProjects((prev) => prev.filter((x) => x.id !== p.id));
    else alert(res.error || "삭제에 실패했습니다.");
  };

  /* ── 씬 목록 (선택된 프로젝트 안) ── */
  const loadScenes = useCallback(async (projectId: string) => {
    setScenesLoading(true);
    try {
      const res = await fetch(`/api/prompter-scripts?projectId=${projectId}`).then((r) => r.json());
      setScenes(res.scripts ?? []);
    } finally {
      setScenesLoading(false);
    }
  }, []);

  const openProject = (p: Project) => {
    setCurrentProject(p);
    loadScenes(p.id);
    newScene();
    setMode("scenes");
  };
  const backToProjects = () => { loadProjects(); setMode("projects"); };

  const newScene = () => {
    skipNextAutoSaveRef.current = true;
    setText(""); setTitle(""); setSubject(""); setSceneId(null); setEditorMode("text");
    setSpeakerMap([]); setMultiSpeakerMode(false);
  };
  const openScene = (s: Scene) => {
    skipNextAutoSaveRef.current = true;
    setText(s.content); setTitle(s.title); setSubject(s.subject ?? ""); setSceneId(s.id);
    setEditorMode(s.editor_mode === "slides" ? "slides" : "text");
    const loadedMap = Array.isArray(s.speaker_map) ? s.speaker_map : [];
    setSpeakerMap(loadedMap);
    setMultiSpeakerMode(loadedMap.some((id) => id));
  };

  /* ── 슬라이드별 편집 (문장 단위 카드) — text를 줄 단위로 쪼개서 보여줄 뿐, 저장 형식은 그대로 하나의 텍스트 ── */
  const updateSlide = (i: number, value: string) => {
    const next = [...slides]; next[i] = value; setText(next.join("\n"));
  };
  const addSlide = () => setText(text ? `${text}\n` : "");
  const removeSlide = (i: number) => setText(slides.filter((_, idx) => idx !== i).join("\n"));
  const moveSlide = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= slides.length) return;
    const next = [...slides];
    [next[i], next[j]] = [next[j], next[i]];
    setText(next.join("\n"));
  };

  /* ── 다중 화자 — 문단별 카드 편집 (editParagraphs 기준, 화자 배정은 speakerMap과 같은 인덱스로 맞춰간다) ── */
  const updateParagraph = (i: number, value: string) => {
    // 카드 안에서 빈 줄을 넣어도 문단 경계가 흐트러지지 않게 정리.
    const cleaned = value.replace(/\n\s*\n+/g, "\n");
    const next = [...editParagraphs]; next[i] = cleaned;
    setText(next.join("\n\n"));
  };
  const addParagraph = () => {
    setText(text ? `${text}\n\n` : "");
    setSpeakerMap((prev) => [...prev, ""]);
  };
  const removeParagraph = (i: number) => {
    setText(editParagraphs.filter((_, idx) => idx !== i).join("\n\n"));
    setSpeakerMap((prev) => prev.filter((_, idx) => idx !== i));
  };
  const moveParagraph = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= editParagraphs.length) return;
    const nextP = [...editParagraphs];
    [nextP[i], nextP[j]] = [nextP[j], nextP[i]];
    setText(nextP.join("\n\n"));
    setSpeakerMap((prev) => {
      const n = [...prev];
      while (n.length < editParagraphs.length) n.push("");
      [n[i], n[j]] = [n[j], n[i]];
      return n;
    });
  };
  const setParagraphSpeaker = (i: number, speakerId: string) => {
    setSpeakerMap((prev) => {
      const n = [...prev];
      while (n.length <= i) n.push("");
      n[i] = speakerId;
      return n;
    });
  };

  /* ── 화자 관리 (프로젝트 단위로 저장) ── */
  const saveSpeakers = async (next: Speaker[]) => {
    setSpeakers(next);
    if (!currentProject) return;
    const res = await fetch("/api/prompter-projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: currentProject.id, name: currentProject.name, speakers: next }),
    }).then((r) => r.json());
    if (res.ok) setCurrentProject(res.project);
  };
  const addSpeaker = () => {
    const name = prompt("화자 이름을 입력하세요 (예: 원장님)");
    if (!name?.trim()) return;
    const color = SPEAKER_PALETTE[speakers.length % SPEAKER_PALETTE.length];
    saveSpeakers([...speakers, { id: crypto.randomUUID(), name: name.trim(), color }]);
  };
  const renameSpeaker = (id: string) => {
    const sp = speakers.find((s) => s.id === id);
    if (!sp) return;
    const name = prompt("화자 이름 수정", sp.name);
    if (!name?.trim()) return;
    saveSpeakers(speakers.map((s) => (s.id === id ? { ...s, name: name.trim() } : s)));
  };
  const removeSpeaker = (id: string) => {
    if (!confirm("이 화자를 삭제할까요? 배정된 문단은 미지정 상태가 됩니다.")) return;
    saveSpeakers(speakers.filter((s) => s.id !== id));
    setSpeakerMap((prev) => prev.map((sid) => (sid === id ? "" : sid)));
  };

  // speed/flipV를 ref로도 들고 있는다 — 슬라이더를 드래그하거나 리모컨에서 값이 자주 바뀔 때마다
  // 아래 스크롤 루프 effect가 매번 취소·재시작되면 프레임이 끊겨 보인다. ref로 매 프레임 최신값만
  // 읽으면 루프는 재생 중 한 번만 시작되고 끊기지 않는다.
  const speedRef = useRef(speed);
  useEffect(() => { speedRef.current = speed; }, [speed]);
  const flipVRef = useRef(flipV);
  useEffect(() => { flipVRef.current = flipV; }, [flipV]);
  const guideEnabledRef = useRef(guideEnabled);
  useEffect(() => { guideEnabledRef.current = guideEnabled; }, [guideEnabled]);
  const guidePositionRef = useRef(guidePosition);
  useEffect(() => { guidePositionRef.current = guidePosition; }, [guidePosition]);
  const guideHighlightRef = useRef(guideHighlight);
  useEffect(() => { guideHighlightRef.current = guideHighlight; }, [guideHighlight]);
  const focusedParagraphIndexRef = useRef<number | null>(null);
  const countdownEnabledRef = useRef(countdownEnabled);
  useEffect(() => { countdownEnabledRef.current = countdownEnabled; }, [countdownEnabled]);
  // 리모컨 명령 핸들러는 세션 시작 시점 클로저라 scrolling/countdown을 직접 읽으면 오래된 값을
  // 볼 수 있다 — 재생 토글 판단은 항상 ref의 최신값으로 한다.
  const scrollingRef = useRef(scrolling);
  useEffect(() => { scrollingRef.current = scrolling; }, [scrolling]);
  const countdownRef = useRef(countdown);
  useEffect(() => { countdownRef.current = countdown; }, [countdown]);

  /* ── 자동 스크롤 (전체 텍스트 모드) ── */
  useEffect(() => {
    if (mode !== "prompt" || editorMode === "slides") return;
    if (!scrolling) {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      lastTsRef.current = null;
      return;
    }
    const step = (ts: number) => {
      if (lastTsRef.current == null) lastTsRef.current = ts;
      const dt = (ts - lastTsRef.current) / 1000;
      lastTsRef.current = ts;
      const box = scrollBoxRef.current;
      if (box) {
        const flipVNow = flipVRef.current;
        // scrollTop은 항상 증가만 한다 — 상하반전(flipV)은 CSS scaleY로 화면을 뒤집어서 처리하므로,
        // 같은 증가 방향이라도 뒤집힌 화면에서는 자연스럽게 스크롤이 반대로 보인다.
        box.scrollTop += speedRef.current * dt;
        // 끝에 도달하면 자동 정지 — vAlign 여백(top/center 등) 때문에 스크롤 총량 기준으로 멈추면
        // 마지막 문단이 화면 위로 사라진 지 한참 뒤에야 멈추게 된다. 그 대신 마지막 문단이
        // 화면(가이드) 밖으로 완전히 넘어가기 직전, 화면 경계에 닿는 순간 멈춘다.
        // 뒤집힌 화면에서는 scaleY 때문에 시각적 위/아래가 반대이므로 반대쪽 경계를 본다.
        const lastEl = lastParagraphRef.current;
        if (lastEl) {
          const rect = lastEl.getBoundingClientRect();
          const passedScreen = flipVNow ? rect.top >= box.clientHeight : rect.bottom <= 0;
          if (passedScreen) setScrolling(false);
        } else if (box.scrollTop >= box.scrollHeight - box.clientHeight - 4) {
          setScrolling(false);
        }
        // 포커스 가이드라인을 지나는 문단 하이라이트 (옵션) — 매 프레임 문단 위치를 검사해서
        // 가이드라인과 겹치는 문단만 찾는다. 켜져 있을 때만 계산(끄면 비용 0).
        if (guideEnabledRef.current && guideHighlightRef.current) {
          const guideY = box.clientHeight * (guidePositionRef.current / 100);
          let found: number | null = null;
          for (let idx = 0; idx < paragraphRefs.current.length; idx++) {
            const pEl = paragraphRefs.current[idx];
            if (!pEl) continue;
            const r = pEl.getBoundingClientRect();
            if (r.top <= guideY && r.bottom >= guideY) { found = idx; break; }
          }
          if (found !== focusedParagraphIndexRef.current) {
            focusedParagraphIndexRef.current = found;
            setFocusedParagraphIndex(found);
          }
        }
      }
      rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [scrolling, mode, editorMode]);

  /* ── 타이머 ── */
  useEffect(() => {
    if (scrolling) {
      timerRef.current = setInterval(() => setElapsed((e) => e + 1), 1000);
    } else if (timerRef.current) {
      clearInterval(timerRef.current);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [scrolling]);

  /* ── 리모컨으로 상태 방송 — 설정이 뭐 하나라도 바뀌면(재생 중이 아니어도) 바로 리모컨에도 반영한다.
     예전엔 재생 중일 때만 방송해서, 일시정지 상태에서 속도를 바꾸면 리모컨엔 안 보이는 버그가 있었다.
     단, 슬라이더를 드래그하는 동안엔 값이 프레임마다 바뀌어 방송이 폭주하면서 화면(및 리모컨) 쪽이
     끊겨 보이므로, 80ms에 한 번으로 제한하고 마지막 값은 반드시 반영되게 트레일링으로 한 번 더 보낸다. ── */
  const lastBroadcastRef = useRef(0);
  const pendingBroadcastRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const send = () => {
      const box = scrollBoxRef.current;
      const scrollProgress = box && box.scrollHeight > box.clientHeight
        ? box.scrollTop / (box.scrollHeight - box.clientHeight)
        : 0;
      channelRef.current?.send({
        type: "broadcast", event: "state",
        payload: {
          playing: scrolling, elapsed, speed, flipH, flipV, hAlign, vAlign,
          fontColor, fontFamily, fontSize, paragraphSpacing, bgColor, lineHeight,
          editorMode, slideIndex, totalSlides: slides.length,
          paragraphIndex, totalParagraphs: paragraphs.length, scrollProgress, countdown,
        },
      });
    };
    if (pendingBroadcastRef.current) { clearTimeout(pendingBroadcastRef.current); pendingBroadcastRef.current = null; }
    const sinceLast = Date.now() - lastBroadcastRef.current;
    if (sinceLast >= 80) {
      lastBroadcastRef.current = Date.now();
      send();
    } else {
      pendingBroadcastRef.current = setTimeout(() => {
        lastBroadcastRef.current = Date.now();
        send();
      }, 80 - sinceLast);
    }
    return () => { if (pendingBroadcastRef.current) clearTimeout(pendingBroadcastRef.current); };
  }, [scrolling, elapsed, speed, flipH, flipV, hAlign, vAlign, fontColor, fontFamily, fontSize, paragraphSpacing, bgColor, lineHeight, editorMode, slideIndex, slides.length, paragraphIndex, paragraphs.length, countdown]);

  // 프롬프터 모드를 나갈 때 녹화/스크롤/리모컨 채널이 백그라운드에 남지 않도록 정리한다.
  useEffect(() => {
    if (mode !== "prompt") {
      setScrolling(false);
      setCountdown(null);
      if (countdownTimerRef.current) clearTimeout(countdownTimerRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      if (channelRef.current) { channelRef.current.unsubscribe(); channelRef.current = null; }
      setSessionCode(null);
      if (document.fullscreenElement) {
        intentionalExitRef.current = true;
        document.exitFullscreen().catch(() => { intentionalExitRef.current = false; });
      }
    }
  }, [mode]);

  // 카운트다운 진행 — countdown이 3→2→1로 줄어들다가 0 이하가 되면 실제로 스크롤을 시작한다.
  useEffect(() => {
    if (countdown === null) return;
    if (countdown <= 0) {
      setCountdown(null);
      setScrolling(true);
      return;
    }
    countdownTimerRef.current = setTimeout(() => setCountdown((c) => (c === null ? null : c - 1)), 1000);
    return () => { if (countdownTimerRef.current) clearTimeout(countdownTimerRef.current); };
  }, [countdown]);

  // 슬라이드 모드 실행 중 좌우 화살표 키로도 넘길 수 있게. 전체 텍스트 모드에서도 단축키 지원.
  useEffect(() => {
    if (mode !== "prompt") return;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement)) return;
      if (editorMode === "slides") {
        if (e.key === "ArrowRight") setSlideIndex((i) => Math.min(i + 1, slides.length - 1));
        if (e.key === "ArrowLeft") setSlideIndex((i) => Math.max(i - 1, 0));
        return;
      }
      if (e.key === " ") { e.preventDefault(); togglePlayback(); }
      else if (e.key === "r" || e.key === "R") { resetTimer(); }
      else if (e.key === "ArrowUp") { e.preventDefault(); jumpParagraph(-1); }
      else if (e.key === "ArrowDown") { e.preventDefault(); jumpParagraph(1); }
      else if (e.key === "f" || e.key === "F") { toggleFullscreen(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mode, editorMode, slides.length]);

  const resetTimer = () => {
    setElapsed(0);
    setParagraphIndex(0);
    setCountdown(null);
    if (countdownTimerRef.current) clearTimeout(countdownTimerRef.current);
    if (editorMode === "slides") { setSlideIndex(0); return; }
    // scrollTop은 flipV와 무관하게 항상 0이 "처음"이다 (뒤집힌 화면은 CSS scaleY로만 처리).
    if (scrollBoxRef.current) scrollBoxRef.current.scrollTop = 0;
  };

  /* ── 재생 시작/정지 — 실행화면이 카운트다운의 유일한 소스다. 리모컨 명령도 항상 이 함수들을
     거치게 해서 두 화면의 카운트다운이 어긋나지 않게 한다. ── */
  const startPlayback = () => {
    if (editorMode === "slides") { setScrolling(true); return; }
    if (countdownEnabledRef.current) {
      setScrolling(false);
      setCountdown(3);
    } else {
      setScrolling(true);
    }
  };
  const stopPlayback = () => {
    setCountdown(null);
    if (countdownTimerRef.current) clearTimeout(countdownTimerRef.current);
    setScrolling(false);
  };
  const togglePlayback = () => {
    if (scrollingRef.current || countdownRef.current !== null) stopPlayback();
    else startPlayback();
  };

  /* ── 전체 텍스트 모드에서 특정 문단을 화면 맨 위로 이동 (리모컨의 이전/다음 문단 버튼용) ── */
  const scrollToParagraph = (i: number) => {
    const box = scrollBoxRef.current;
    const el = paragraphRefs.current[i];
    if (!box || !el) return;
    const top = el.getBoundingClientRect().top;
    // 상하반전 상태에선 scaleY로 화면이 뒤집혀 있어 scrollTop 증감과 화면상 위치 변화가 반대로 움직인다.
    const delta = flipVRef.current ? -top : top;
    box.scrollTop = Math.max(0, Math.min(box.scrollTop + delta, box.scrollHeight - box.clientHeight));
  };
  const jumpParagraph = (dir: -1 | 1) => {
    if (paragraphs.length === 0) return;
    const next = Math.max(0, Math.min(paragraphIndexRef.current + dir, paragraphs.length - 1));
    paragraphIndexRef.current = next;
    setParagraphIndex(next);
    setScrolling(false);
    scrollToParagraph(next);
  };

  /* ── 리모컨 세션 ── */
  const enterPromptMode = () => {
    if (isMobile) { setShowMobileBlocked(true); return; }

    setElapsed(0);
    setSlideIndex(0);
    const code = String(Math.floor(1000 + Math.random() * 9000));
    setSessionCode(code);
    setMode("prompt");

    const supabase = getSupabase();
    const channel = supabase.channel(`prompter-${code}`, { config: { broadcast: { self: false } } });

    // 리모컨에 실제 대본 내용을 보내서 화면을 그대로 미리보기 할 수 있게 한다.
    // (연결 시점에 따라 리모컨이 구독을 늦게 시작할 수도 있어, "requestContent" 요청에도 다시 보내준다.)
    const sendContent = () => {
      channel.send({
        type: "broadcast", event: "content",
        payload: { paragraphs, slides, speakers, speakerMap: playbackSpeakerMap },
      });
    };

    channel.on("broadcast", { event: "command" }, ({ payload }) => {
      switch (payload.type) {
        case "toggle": togglePlayback(); break;
        case "play": startPlayback(); break;
        case "pause": stopPlayback(); break;
        case "restart":
          setElapsed(0); setSlideIndex(0); setParagraphIndex(0); paragraphIndexRef.current = 0;
          setCountdown(null);
          if (scrollBoxRef.current) scrollBoxRef.current.scrollTop = 0;
          break;
        case "nextSlide":
          if (editorMode === "slides") setSlideIndex((i) => Math.min(i + 1, slides.length - 1));
          else jumpParagraph(1);
          break;
        case "prevSlide":
          if (editorMode === "slides") setSlideIndex((i) => Math.max(i - 1, 0));
          else jumpParagraph(-1);
          break;
        case "speed": setSpeed(payload.value); break;
        case "flipH": setFlipH((v) => !v); break;
        case "flipV": setFlipV((v) => !v); break;
        case "hAlign": setHAlign(payload.value); break;
        case "vAlign": setVAlign(payload.value); break;
        case "fontColor": setFontColor(payload.value); break;
        case "fontFamily": setFontFamily(payload.value); break;
        case "fontSize": setFontSize(payload.value); break;
        case "paragraphSpacing": setParagraphSpacing(payload.value); break;
        case "bgColor": setBgColor(payload.value); break;
        case "lineHeight": setLineHeight(payload.value); break;
        case "seek": {
          // 리모컨에서 미리보기를 직접 드래그해서 스크롤 위치를 지정했을 때.
          const box = scrollBoxRef.current;
          if (box && typeof payload.value === "number") {
            const max = box.scrollHeight - box.clientHeight;
            box.scrollTop = Math.max(0, Math.min(payload.value * max, max));
            stopPlayback();
          }
          break;
        }
        case "requestContent": sendContent(); break;
      }
    });

    channel.subscribe((status) => {
      // 구독 직후 한 번 방송해둬야 리모컨이 조작하기 전에도 "연결됨"과 현재 설정을 바로 보여준다.
      if (status === "SUBSCRIBED") {
        channel.send({
          type: "broadcast", event: "state",
          payload: {
            playing: false, elapsed: 0, speed, flipH, flipV, hAlign, vAlign,
            fontColor, fontFamily, fontSize, paragraphSpacing, bgColor, lineHeight,
            editorMode, slideIndex: 0, totalSlides: slides.length,
            paragraphIndex: 0, totalParagraphs: paragraphs.length, scrollProgress: 0, countdown: null,
          },
        });
        sendContent();
      }
    });
    channelRef.current = channel;
  };

  const exitPromptMode = () => {
    if (recording) stopRecording();
    setMode("scenes");
  };

  /* ── 녹화 ── */
  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      streamRef.current = stream;
      if (videoPreviewRef.current) { videoPreviewRef.current.srcObject = stream; videoPreviewRef.current.play(); }
      chunksRef.current = [];
      const mimeType = pickSupportedMimeType();
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeType || "video/webm" });
        setRecordedUrl(URL.createObjectURL(blob));
        stream.getTracks().forEach((t) => t.stop());
      };
      recorder.start();
      recorderRef.current = recorder;
      setRecording(true);
    } catch (err) {
      alert("카메라/마이크 권한이 필요합니다: " + (err instanceof Error ? err.message : String(err)));
    }
  }, []);

  const stopRecording = useCallback(() => {
    recorderRef.current?.stop();
    setRecording(false);
  }, []);

  // 자동저장 — 대본을 고치다가 저장을 안 누르고 나가서 유실되는 걸 막는다. 씬을 불러오거나
  // 새로 만든 직후(=사용자가 아직 아무것도 안 고침)는 저장할 필요가 없어 한 번 건너뛴다.
  useEffect(() => {
    if (mode !== "scenes" || !currentProject) return;
    if (skipNextAutoSaveRef.current) { skipNextAutoSaveRef.current = false; return; }
    if (!text.trim()) return;
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = setTimeout(() => { saveScene(true); }, 3000);
    return () => { if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, title, subject, mode]);

  /* ── 저장/삭제 ── */
  const saveScene = async (silent = false) => {
    if (!text.trim() || saving || !currentProject) return;
    setSaving(true);
    try {
      const cleaned = multiSpeakerMode ? getCleanParagraphs(text, speakerMap) : null;
      const contentToSave = cleaned ? cleaned.paragraphs.join("\n\n") : text;
      const speakerMapToSave = cleaned ? cleaned.speakerMap : [];
      const res = await fetch("/api/prompter-scripts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: sceneId, projectId: currentProject.id, title: title || "제목 없는 씬", subject, content: contentToSave, editorMode, speakerMap: speakerMapToSave }),
      }).then((r) => r.json());
      if (res.ok) {
        setSceneId(res.script.id); setTitle(res.script.title); setSubject(res.script.subject ?? "");
        setLastAutoSavedAt(Date.now());
        await loadScenes(currentProject.id);
      } else if (!silent) {
        alert(res.error || "저장에 실패했습니다.");
      } else {
        console.error("자동저장 실패:", res.error);
      }
    } finally {
      setSaving(false);
    }
  };
  /* ── 씬 드래그 순서 변경 ── */
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const handleDragOver = (e: React.DragEvent, i: number) => {
    e.preventDefault();
    if (dragIndex === null || dragIndex === i) return;
    setScenes((prev) => {
      const next = [...prev];
      const [moved] = next.splice(dragIndex, 1);
      next.splice(i, 0, moved);
      return next;
    });
    setDragIndex(i);
  };
  const handleDragEnd = async () => {
    setDragIndex(null);
    if (!currentProject) return;
    await fetch("/api/prompter-scripts/reorder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId: currentProject.id, orderedIds: scenes.map((s) => s.id) }),
    });
  };

  /* ── AI 검토 (맞춤법 / 자연스러운 표현) ── */
  const runAiReview = async () => {
    if (!text.trim() || aiReviewLoading) return;
    setAiReviewLoading(true);
    setAiReviewOpen(true);
    try {
      const res = await fetch("/api/prompter-proofread", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      }).then((r) => r.json());
      if (res.ok) setAiIssues(res.issues ?? []);
      else { setAiIssues([]); alert(res.error || "AI 검토에 실패했습니다."); }
    } catch {
      setAiIssues([]);
      alert("AI 검토에 실패했습니다.");
    } finally {
      setAiReviewLoading(false);
    }
  };
  const applyAiIssue = (issue: AiIssue) => {
    if (!text.includes(issue.original)) {
      alert("원문이 이미 바뀌어 적용할 수 없어요.");
      setAiIssues((prev) => prev.filter((i) => i !== issue));
      return;
    }
    setText(text.replace(issue.original, issue.suggestion));
    setAiIssues((prev) => prev.filter((i) => i !== issue));
  };

  const deleteScene = async (id: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (!confirm("이 씬을 삭제할까요?")) return;
    const res = await fetch(`/api/prompter-scripts/${id}`, { method: "DELETE" }).then((r) => r.json());
    if (res.ok) {
      setScenes((prev) => prev.filter((s) => s.id !== id));
      if (sceneId === id) newScene();
    } else {
      alert(res.error || "삭제에 실패했습니다.");
    }
  };

  /* ── 프로젝트 생성/이름변경 모달 ── */
  const projectModal = showProjectModal && (
    <div className="pt-modal-backdrop" onClick={() => setShowProjectModal(false)}>
      <div className="pt-modal" onClick={(e) => e.stopPropagation()}>
        <strong style={{ fontSize: 15 }}>{projectModalMode === "create" ? "새 프로젝트 만들기" : "프로젝트 이름 변경"}</strong>
        <p style={{ fontSize: 12, color: "#8aa39f", margin: "6px 0 12px" }}>병원명 또는 기업명을 입력하세요.</p>
        <input
          autoFocus value={projectNameInput} onChange={(e) => setProjectNameInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") submitProjectModal(); }}
          placeholder="예: 미소로한의원"
          style={{ width: "100%", padding: "10px 14px", fontSize: 14, border: "1px solid #E0E8E6", borderRadius: 10, marginBottom: 14 }}
        />
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => setShowProjectModal(false)} className="pt-btn" style={{ flex: 1 }}>취소</button>
          <button onClick={submitProjectModal} className="pt-btn pt-btn-primary" style={{ flex: 1 }} disabled={!projectNameInput.trim() || savingProject}>
            {savingProject ? "저장 중..." : "확인"}
          </button>
        </div>
      </div>
    </div>
  );

  /* ── 프로젝트 목록 화면 ── */
  if (mode === "projects") {
    return (
      <main style={{ minHeight: "100vh", background: "var(--mesh-bg)" }}>
        <PageHeader title="프롬프터" />
        <div className="oa-page pt-projects-page">
          <button onClick={() => openProjectModal("create")} className="pt-new-project-btn"><Plus size={20} /> 새 프로젝트 만들기</button>

          <div className="pt-section-label">최근 프로젝트</div>
          {projectsLoading ? (
            <p style={{ color: "#8aa39f", fontSize: 13 }}>불러오는 중…</p>
          ) : projects.length === 0 ? (
            <p style={{ color: "#8aa39f", fontSize: 13 }}>아직 프로젝트가 없어요. 병원/기업 단위로 새 프로젝트를 만들어보세요.</p>
          ) : (
            <div className="admin-menu-grid pt-project-grid-v2">
              {projects.map((p) => (
                <div key={p.id} className="admin-menu-card pt-project-card-v2" onClick={() => openProject(p)}>
                  <div className="admin-menu-icon"><Building2 size={24} /></div>
                  <div className="admin-menu-copy">
                    <span>{p.sceneCount}개 씬</span>
                    <h2>{p.name}</h2>
                    <p>최근 업데이트: {fmtDate(p.lastActivity)}</p>
                  </div>
                  <button className="pt-project-card-delete" onClick={(e) => deleteProject(p, e)} title="삭제"><Trash2 size={14} /></button>
                </div>
              ))}
            </div>
          )}
        </div>
        {projectModal}
      </main>
    );
  }

  /* ── 씬 편집 화면 ── */
  if (mode === "scenes") {
    return (
      <main style={{ minHeight: "100vh", background: "var(--mesh-bg)" }}>
        <PageHeader
          title="프롬프터"
          actions={<>
            <button onClick={backToProjects} className="pt-btn"><ChevronLeft size={15} /> 프로젝트 목록</button>
            <button onClick={runAiReview} className="pt-btn" disabled={!text.trim() || aiReviewLoading}><Sparkles size={15} /> {aiReviewLoading ? "검토 중..." : "AI 검토"}</button>
            <button onClick={() => saveScene()} className="pt-btn" disabled={!text.trim() || saving}><Save size={16} /> {saving ? "저장 중..." : "저장"}</button>
            {!saving && lastAutoSavedAt && (
              <span style={{ fontSize: 11, color: "#8aa39f", alignSelf: "center" }}>저장됨 · 방금 전</span>
            )}
            <button onClick={enterPromptMode} className="pt-btn pt-btn-primary" disabled={!text.trim()}>편집 후 실행 →</button>
          </>}
        />
        <div className="oa-page">
          <div className="pt-scene-project-banner">
            <Building2 size={16} />
            <span>{currentProject?.name}</span>
            <button onClick={() => openProjectModal("rename")} title="이름 수정"><Pencil size={13} /></button>
          </div>
          <div className="pt-edit-layout">
            <aside className="pt-navigator">
              <button onClick={newScene} className="pt-navigator-new"><Plus size={14} /> 새로운 Scene</button>
              {scenesLoading ? (
                <p style={{ color: "#9BB5B0", fontSize: 12, padding: "0 4px" }}>불러오는 중…</p>
              ) : scenes.length === 0 ? (
                <p style={{ color: "#9BB5B0", fontSize: 12, padding: "0 4px" }}>아직 씬이 없어요.</p>
              ) : (
                scenes.map((s, i) => (
                  <div
                    key={s.id}
                    className={`pt-nav-item${s.id === sceneId ? " active" : ""}${dragIndex === i ? " dragging" : ""}`}
                    draggable
                    onDragStart={() => setDragIndex(i)}
                    onDragOver={(e) => handleDragOver(e, i)}
                    onDrop={(e) => e.preventDefault()}
                    onDragEnd={handleDragEnd}
                  >
                    <span className="pt-nav-item-handle" title="드래그로 순서 변경"><GripVertical size={14} /></span>
                    <button className="pt-nav-item-main" onClick={() => openScene(s)}>
                      <strong>{s.title}</strong>
                      <span>{fmtDate(s.updated_at)}</span>
                    </button>
                    <button className="pt-nav-item-delete" onClick={(e) => deleteScene(s.id, e)} title="삭제"><Trash2 size={13} /></button>
                  </div>
                ))
              )}
            </aside>
            <div className="pt-editor-main">
              <input
                value={title} onChange={(e) => setTitle(e.target.value)} placeholder="씬(촬영) 제목"
                className="pt-input-title"
              />
              <input
                value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="촬영대상 (예: OOO 원장님 인터뷰)"
                className="pt-input-subject"
              />

              <div className="pt-editor-mode-toggle">
                <button className={editorMode === "text" ? "active" : ""} onClick={() => setEditorMode("text")}><FileText size={13} /> 전체 텍스트</button>
                <button className={editorMode === "slides" ? "active" : ""} onClick={() => setEditorMode("slides")}><Rows3 size={13} /> 슬라이드별</button>
              </div>

              {editorMode === "text" && (
                <div className="pt-speaker-bar">
                  <button
                    className={`pt-speaker-toggle${multiSpeakerMode ? " active" : ""}`}
                    onClick={() => setMultiSpeakerMode((v) => !v)}
                  >
                    <Users size={13} /> 다중 화자 {multiSpeakerMode ? "끄기" : "켜기"}
                  </button>
                  {multiSpeakerMode && (
                    <div className="pt-speaker-chips">
                      {speakers.map((sp) => (
                        <span key={sp.id} className="pt-speaker-chip" style={{ borderColor: sp.color, color: sp.color, background: sp.color + "18" }}>
                          <button onClick={() => renameSpeaker(sp.id)}>{sp.name}</button>
                          <button onClick={() => removeSpeaker(sp.id)} title="삭제"><X size={10} /></button>
                        </span>
                      ))}
                      <button className="pt-speaker-add" onClick={addSpeaker}><Plus size={12} /> 화자 추가</button>
                    </div>
                  )}
                </div>
              )}

              {editorMode === "text" ? (
                multiSpeakerMode ? (
                  <div className="pt-para-list">
                    {editParagraphs.map((p, i) => {
                      const sp = speakers.find((s) => s.id === speakerMap[i]);
                      return (
                        <div key={i} className="pt-para-card">
                          <div className="pt-para-card-speaker">
                            <select
                              value={speakerMap[i] ?? ""}
                              onChange={(e) => setParagraphSpeaker(i, e.target.value)}
                              style={sp ? { borderColor: sp.color, color: sp.color } : undefined}
                            >
                              <option value="">미지정</option>
                              {speakers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                            </select>
                            <div className="pt-para-card-actions">
                              <button onClick={() => moveParagraph(i, -1)} disabled={i === 0} title="위로"><ChevronUp size={13} /></button>
                              <button onClick={() => moveParagraph(i, 1)} disabled={i === editParagraphs.length - 1} title="아래로"><ChevronDown size={13} /></button>
                              <button onClick={() => removeParagraph(i)} title="삭제"><Trash2 size={12} /></button>
                            </div>
                          </div>
                          <textarea
                            value={p} onChange={(e) => updateParagraph(i, e.target.value)} rows={3}
                            placeholder="문단 내용을 입력하세요"
                            style={sp ? { borderLeftColor: sp.color } : undefined}
                          />
                        </div>
                      );
                    })}
                    <button onClick={addParagraph} className="pt-slide-add"><Plus size={14} /> 문단 추가</button>
                  </div>
                ) : (
                  <textarea
                    value={text} onChange={(e) => setText(e.target.value)}
                    placeholder="여기에 대본을 입력하세요. 빈 줄로 문단을 구분하면 실행화면에서 문단 간격이 적용됩니다."
                    className="pt-textarea"
                  />
                )
              ) : (
                <div className="pt-slide-list">
                  {slides.map((s, i) => (
                    <div key={i} className="pt-slide-card">
                      <div className="pt-slide-card-head">
                        <span>{i + 1}</span>
                        <div className="pt-slide-card-actions">
                          <button onClick={() => moveSlide(i, -1)} disabled={i === 0} title="위로"><ChevronUp size={14} /></button>
                          <button onClick={() => moveSlide(i, 1)} disabled={i === slides.length - 1} title="아래로"><ChevronDown size={14} /></button>
                          <button onClick={() => removeSlide(i)} title="삭제"><Trash2 size={13} /></button>
                        </div>
                      </div>
                      <textarea
                        value={s} onChange={(e) => updateSlide(i, e.target.value)} rows={2}
                        placeholder="문장을 입력하세요"
                      />
                    </div>
                  ))}
                  <button onClick={addSlide} className="pt-slide-add"><Plus size={14} /> 문장 추가</button>
                </div>
              )}
            </div>
          </div>
        </div>

        {showMobileBlocked && (
          <div className="pt-modal-backdrop" onClick={() => setShowMobileBlocked(false)}>
            <div className="pt-modal" onClick={(e) => e.stopPropagation()} style={{ textAlign: "center" }}>
              <strong style={{ fontSize: 15 }}>PC 또는 태블릿에서 실행해주세요</strong>
              <p style={{ fontSize: 13, color: "#6a8e8a", margin: "10px 0 0" }}>
                모바일 화면은 프롬프터를 읽기엔 너무 작아요.<br />대신 리모컨 기능으로 PC/태블릿의 큰 화면을 조작해보세요.
              </p>
              <button onClick={() => setShowMobileBlocked(false)} className="pt-btn pt-btn-primary" style={{ marginTop: 16, width: "100%" }}>확인</button>
            </div>
          </div>
        )}

        {aiReviewOpen && (
          <div className="pt-modal-backdrop" onClick={() => setAiReviewOpen(false)}>
            <div className="pt-modal pt-ai-modal" onClick={(e) => e.stopPropagation()}>
              <div className="pt-ai-modal-head">
                <strong style={{ fontSize: 15 }}><Sparkles size={15} /> AI 맞춤법 · 표현 검토</strong>
                <button onClick={() => setAiReviewOpen(false)} className="pt-ai-modal-close"><X size={16} /></button>
              </div>
              {aiReviewLoading ? (
                <p style={{ fontSize: 13, color: "#8aa39f", padding: "24px 0", textAlign: "center" }}>AI가 대본을 검토하고 있어요…</p>
              ) : aiIssues.length === 0 ? (
                <p style={{ fontSize: 13, color: "#8aa39f", padding: "24px 0", textAlign: "center" }}>발견된 문제가 없어요.</p>
              ) : (
                <div className="pt-ai-issue-list">
                  {aiIssues.map((issue, i) => (
                    <div key={i} className="pt-ai-issue">
                      <span className={`pt-ai-issue-tag pt-ai-issue-tag-${issue.type}`}>{issue.type === "spelling" ? "맞춤법" : "표현"}</span>
                      <div className="pt-ai-issue-body">
                        <div className="pt-ai-issue-diff">
                          <span className="pt-ai-issue-original">{issue.original}</span>
                          <span className="pt-ai-issue-arrow">→</span>
                          <span className="pt-ai-issue-suggestion">{issue.suggestion}</span>
                        </div>
                        {issue.reason && <p className="pt-ai-issue-reason">{issue.reason}</p>}
                      </div>
                      <button onClick={() => applyAiIssue(issue)} className="pt-ai-issue-apply">적용</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
        {projectModal}
      </main>
    );
  }

  /* ── 프롬프터(전체화면) 실행 모드 ── */
  const isSlideMode = editorMode === "slides";
  // 진행률 바 — elapsed가 1초마다 갱신되면서 리렌더될 때 현재 scrollTop을 다시 읽어 계산한다.
  const scrollProgressNow = (() => {
    const box = scrollBoxRef.current;
    if (!box || box.scrollHeight <= box.clientHeight) return 0;
    return Math.max(0, Math.min(1, box.scrollTop / (box.scrollHeight - box.clientHeight)));
  })();
  return (
    <div ref={promptRootRef} style={{ position: "fixed", inset: 0, background: bgColor, zIndex: 999 }}>
      {isSlideMode ? (
        <div style={{
          height: "100%", display: "flex", flexDirection: "column",
          justifyContent: vAlign === "top" ? "flex-start" : vAlign === "bottom" ? "flex-end" : "center",
          padding: "0 8vw",
          transform: `scaleX(${flipH ? -1 : 1}) scaleY(${flipV ? -1 : 1})`,
        }}>
          <p style={{ fontSize, color: fontColor, fontFamily, lineHeight, whiteSpace: "pre-wrap", margin: 0, textAlign: hAlign, width: "100%" }}>
            {slides[slideIndex] ?? ""}
          </p>
        </div>
      ) : (
        <div
          ref={scrollBoxRef}
          style={{
            height: "100%", overflowY: "auto",
            padding: `${V_ALIGN_PADDING[vAlign].top} 8vw ${V_ALIGN_PADDING[vAlign].bottom}`,
            transform: `scaleX(${flipH ? -1 : 1}) scaleY(${flipV ? -1 : 1})`,
          }}
        >
          {paragraphs.map((p, i) => {
            const sp = speakers.find((s) => s.id === playbackSpeakerMap[i]);
            const isFocused = guideEnabled && guideHighlight && focusedParagraphIndex === i;
            return (
              <div
                key={i}
                ref={(el) => { paragraphRefs.current[i] = el; if (i === paragraphs.length - 1) lastParagraphRef.current = el; }}
                style={{
                  margin: `0 0 ${i < paragraphs.length - 1 ? paragraphSpacing : 0}px`, textAlign: hAlign,
                  background: isFocused ? "rgba(232,93,44,.16)" : "transparent",
                  borderRadius: isFocused ? 10 : 0, transition: "background .15s",
                }}
              >
                {sp && (
                  <div style={{ fontSize: Math.max(14, fontSize * 0.32), fontWeight: 900, color: sp.color, marginBottom: 4 }}>
                    {sp.name}
                  </div>
                )}
                <p style={{
                  fontSize, color: fontColor, fontFamily, lineHeight, whiteSpace: "pre-wrap",
                  margin: 0, textAlign: hAlign,
                  borderLeft: sp ? `4px solid ${sp.color}` : "none",
                  paddingLeft: sp ? "0.4em" : 0,
                }}>
                  {p}
                </p>
              </div>
            );
          })}
        </div>
      )}

      {/* 상단 바 — 타이머는 왼쪽 */}
      <div style={{ position: "fixed", top: 16, left: 16, right: 16, display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div className="pt-timer-badge">{fmtTime(elapsed)}</div>
            {isSlideMode && <div className="pt-slide-counter">{slides.length ? slideIndex + 1 : 0} / {slides.length}</div>}
            {recording && <span style={{ color: "#ff5c5c", fontSize: 12, fontWeight: 700, display: "inline-flex", alignItems: "center", gap: 4 }}><Circle size={10} fill="#ff5c5c" /> REC</span>}
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button onClick={() => setShowRemoteInfo(true)} className="pt-icon-btn"><Smartphone size={14} /> 리모컨</button>
            <button onClick={toggleFullscreen} className="pt-icon-btn">{isFullscreen ? <Minimize size={14} /> : <Maximize size={14} />} {isFullscreen ? "전체화면 종료" : "전체화면"}</button>
            <button onClick={() => setShowControls((v) => !v)} className="pt-icon-btn">{showControls ? "설정 숨기기" : "설정"}</button>
            <button onClick={exitPromptMode} className="pt-icon-btn"><X size={18} /></button>
          </div>
        </div>
        {!isSlideMode && (
          <div style={{ height: 4, borderRadius: 999, background: "rgba(255,255,255,.15)", overflow: "hidden", maxWidth: 320 }}>
            <div style={{ height: "100%", width: `${scrollProgressNow * 100}%`, background: "#e85d2c", transition: "width .2s linear" }} />
          </div>
        )}
      </div>

      {/* 중앙 포커스 가이드라인 */}
      {guideEnabled && !isSlideMode && (
        <div style={{ position: "fixed", top: `${guidePosition}%`, left: 0, right: 0, borderTop: "2px dashed rgba(232,93,44,.85)", pointerEvents: "none", zIndex: 6 }} />
      )}

      {/* 촬영 시작 카운트다운 (3-2-1) */}
      {countdown !== null && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1300, pointerEvents: "none" }}>
          <span style={{ fontSize: "min(40vw, 320px)", fontWeight: 900, color: "#fff", textShadow: "0 4px 24px rgba(0,0,0,.5)" }}>
            {countdown}
          </span>
        </div>
      )}

      {/* 녹화 미리보기 (작은 창) */}
      {recording && (
        <video ref={videoPreviewRef} muted style={{ position: "fixed", bottom: 100, right: 16, width: 160, borderRadius: 10, border: "2px solid #fff" }} />
      )}

      {/* 하단 컨트롤 바 */}
      {showControls && (
        <div style={{
          position: "fixed", left: 0, right: 0, bottom: 0, padding: "14px 24px",
          background: "rgba(0,0,0,.75)", display: "flex", flexWrap: "wrap", gap: 16, alignItems: "center",
        }}>
          {isSlideMode ? (
            <>
              <button onClick={() => setSlideIndex((i) => Math.max(i - 1, 0))} disabled={slideIndex === 0} className="pt-ctrl-btn"><ChevronLeft size={18} /> 이전</button>
              <button onClick={() => setSlideIndex((i) => Math.min(i + 1, slides.length - 1))} disabled={slideIndex >= slides.length - 1} className="pt-ctrl-btn">다음 <ChevronRight size={18} /></button>
              <button onClick={resetTimer} className="pt-ctrl-btn"><RotateCcw size={18} /> 처음으로</button>
            </>
          ) : (
            <>
              <button onClick={togglePlayback} className="pt-ctrl-btn">
                {scrolling || countdown !== null ? <Pause size={18} /> : <Play size={18} />} {scrolling ? "일시정지" : countdown !== null ? "취소" : "재생"}
              </button>
              <button onClick={resetTimer} className="pt-ctrl-btn"><RotateCcw size={18} /> 처음으로</button>
              <button onClick={() => jumpParagraph(-1)} disabled={paragraphIndex === 0} className="pt-ctrl-btn"><ChevronUp size={16} /> 이전 문단</button>
              <button onClick={() => jumpParagraph(1)} disabled={paragraphIndex >= paragraphs.length - 1} className="pt-ctrl-btn"><ChevronDown size={16} /> 다음 문단</button>
              <button onClick={() => setCountdownEnabled((v) => !v)} className={`pt-ctrl-btn${countdownEnabled ? " active" : ""}`} title="재생 시 3초 카운트다운">
                <Clock3 size={16} /> 카운트다운
              </button>

              <label className="pt-ctrl-label"><Gauge size={14} /> 속도
                <input type="range" min={1} max={300} step={1} value={speed} onChange={(e) => setSpeed(Number(e.target.value))} style={{ accentColor: "#e85d2c" }} />
                <input
                  type="number" min={1} max={999} value={speed} className="pt-ctrl-num"
                  onChange={(e) => { const v = Number(e.target.value); if (!Number.isNaN(v)) setSpeed(Math.max(1, v)); }}
                />
              </label>

              <label className="pt-ctrl-label"><AlignVerticalSpaceAround size={14} /> 문단간격
                <input type="range" min={0} max={240} step={1} value={paragraphSpacing} onChange={(e) => setParagraphSpacing(Number(e.target.value))} style={{ accentColor: "#e85d2c" }} />
                <input
                  type="number" min={0} max={999} value={paragraphSpacing} className="pt-ctrl-num"
                  onChange={(e) => { const v = Number(e.target.value); if (!Number.isNaN(v)) setParagraphSpacing(Math.max(0, v)); }}
                />
              </label>

              <label className="pt-ctrl-label"><AlignVerticalDistributeCenter size={14} /> 줄간격
                <input type="range" min={1.2} max={2.4} step={0.1} value={lineHeight} onChange={(e) => setLineHeight(Number(e.target.value))} style={{ accentColor: "#e85d2c" }} />
              </label>

              <button onClick={() => setGuideEnabled((v) => !v)} className={`pt-ctrl-btn${guideEnabled ? " active" : ""}`}><Scan size={16} /> 가이드라인</button>
              {guideEnabled && (
                <>
                  <label className="pt-ctrl-label">위치
                    <input type="range" min={5} max={90} value={guidePosition} onChange={(e) => setGuidePosition(Number(e.target.value))} style={{ accentColor: "#e85d2c" }} />
                  </label>
                  <button onClick={() => setGuideHighlight((v) => !v)} className={`pt-ctrl-btn${guideHighlight ? " active" : ""}`}>문단 강조</button>
                </>
              )}
            </>
          )}

          <button onClick={() => setFlipH((v) => !v)} className={`pt-ctrl-btn${flipH ? " active" : ""}`}><FlipHorizontal size={16} /> 좌우반전</button>
          <button onClick={() => setFlipV((v) => !v)} className={`pt-ctrl-btn${flipV ? " active" : ""}`}><FlipVertical size={16} /> 상하반전</button>

          <div className="pt-align-group">
            <button onClick={() => setHAlign("left")} className={`pt-align-btn${hAlign === "left" ? " active" : ""}`} title="왼쪽 정렬"><AlignLeft size={15} /></button>
            <button onClick={() => setHAlign("center")} className={`pt-align-btn${hAlign === "center" ? " active" : ""}`} title="가운데 정렬"><AlignCenter size={15} /></button>
            <button onClick={() => setHAlign("right")} className={`pt-align-btn${hAlign === "right" ? " active" : ""}`} title="오른쪽 정렬"><AlignRight size={15} /></button>
          </div>
          <div className="pt-align-group">
            <button onClick={() => setVAlign("top")} className={`pt-align-btn${vAlign === "top" ? " active" : ""}`} title="위로"><AlignVerticalJustifyStart size={15} /></button>
            <button onClick={() => setVAlign("center")} className={`pt-align-btn${vAlign === "center" ? " active" : ""}`} title="가운데"><AlignVerticalJustifyCenter size={15} /></button>
            <button onClick={() => setVAlign("bottom")} className={`pt-align-btn${vAlign === "bottom" ? " active" : ""}`} title="아래로"><AlignVerticalJustifyEnd size={15} /></button>
          </div>

          <label className="pt-ctrl-label"><Type size={14} /> 크기
            <input type="range" min={20} max={120} value={fontSize} onChange={(e) => setFontSize(Number(e.target.value))} style={{ accentColor: "#e85d2c" }} />
          </label>

          <div className="pt-color-row">
            {COLOR_OPTIONS.map((c) => (
              <button
                key={c} onClick={() => setFontColor(c)}
                className={`pt-color-swatch${fontColor === c ? " active" : ""}`}
                style={{ background: c }} title={c}
              />
            ))}
          </div>

          <label className="pt-ctrl-label"><Palette size={14} /> 배경
            <div className="pt-color-row">
              {BG_COLOR_OPTIONS.map((c) => (
                <button
                  key={c} onClick={() => setBgColor(c)}
                  className={`pt-color-swatch${bgColor === c ? " active" : ""}`}
                  style={{ background: c, border: c === "#FFFFFF" ? "2px solid #999" : undefined }} title={c}
                />
              ))}
            </div>
          </label>
          {bgColor === "#FFFFFF" && fontColor === "#FFFFFF" && (
            <span style={{ fontSize: 11, color: "#ffb199", fontWeight: 700 }}>⚠ 배경·글자색이 같아 안 보여요</span>
          )}

          <select value={fontFamily} onChange={(e) => setFontFamily(e.target.value)} className="pt-ctrl-select pt-ctrl-select-sm">
            {FONT_OPTIONS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
          </select>

          {!recording ? (
            <button onClick={startRecording} className="pt-ctrl-btn pt-rec-btn"><Circle size={16} /> 녹화 시작</button>
          ) : (
            <button onClick={stopRecording} className="pt-ctrl-btn pt-rec-btn active"><Square size={16} /> 녹화 종료</button>
          )}
        </div>
      )}

      {/* 리모컨 QR/코드 */}
      {showRemoteInfo && sessionCode && (
        <div className="pt-modal-backdrop" onClick={() => setShowRemoteInfo(false)}>
          <div className="pt-modal" onClick={(e) => e.stopPropagation()} style={{ textAlign: "center" }}>
            <strong style={{ fontSize: 15 }}>리모컨으로 조작하기</strong>
            <img
              src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(`${typeof window !== "undefined" ? window.location.origin : ""}/prompter/remote/${sessionCode}`)}`}
              alt="리모컨 QR코드" style={{ margin: "16px auto", display: "block" }}
            />
            <p style={{ fontSize: 13, color: "#6a8e8a" }}>폰 카메라로 스캔하거나, 아래 코드를 직접 입력하세요.</p>
            <p style={{ fontSize: 32, fontWeight: 900, letterSpacing: 6, color: "#155855" }}>{sessionCode}</p>
            <p style={{ fontSize: 11, color: "#9BB5B0" }}>{typeof window !== "undefined" ? window.location.origin : ""}/prompter/remote</p>
            <p style={{ fontSize: 11, color: "#c88" }}>⚠️ 촬영이 끝나면 이 화면을 닫아 리모컨 연결을 종료해주세요.</p>
          </div>
        </div>
      )}

      {/* 녹화 완료 후 다운로드 */}
      {recordedUrl && (
        <div className="pt-modal-backdrop" onClick={() => setRecordedUrl(null)}>
          <div className="pt-modal" onClick={(e) => e.stopPropagation()}>
            <strong>녹화가 완료됐어요</strong>
            <video src={recordedUrl} controls style={{ width: "100%", borderRadius: 10, margin: "12px 0" }} />
            <a href={recordedUrl} download={`prompter-${Date.now()}.webm`} className="pt-btn pt-btn-primary">다운로드</a>
          </div>
        </div>
      )}
    </div>
  );
}
