"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import {
  FlipHorizontal, FlipVertical, Play, Pause, RotateCcw,
  Circle, Square, Save, Type, Gauge, X, Trash2, Plus,
  AlignLeft, AlignCenter, AlignRight,
  AlignVerticalJustifyStart, AlignVerticalJustifyCenter, AlignVerticalJustifyEnd,
  Smartphone, FileText, Rows3, ChevronUp, ChevronDown, ChevronLeft, ChevronRight,
  Building2, Pencil, AlignVerticalSpaceAround,
} from "lucide-react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import PageHeader from "@/components/PageHeader";
import { getSupabase } from "@/lib/supabase";
import { FONT_OPTIONS, COLOR_OPTIONS, V_ALIGN_PADDING, fmtTime, type HAlign, type VAlign } from "@/lib/prompter/constants";

type Project = { id: string; name: string; sceneCount: number; lastActivity: string; updated_at: string };
type Scene = { id: string; title: string; subject?: string; content: string; editor_mode?: "text" | "slides"; updated_at: string };

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
  const [hAlign, setHAlign] = useState<HAlign>("left");
  const [vAlign, setVAlign] = useState<VAlign>("center");
  const [speed, setSpeed] = useState(40); // px/sec
  const [paragraphSpacing, setParagraphSpacing] = useState(28); // px — 문단(빈 줄로 구분된 덩어리) 사이 간격
  const [scrolling, setScrolling] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [showControls, setShowControls] = useState(true);
  const [slideIndex, setSlideIndex] = useState(0);

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

  const scrollBoxRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number | null>(null);
  const lastTsRef = useRef<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const slides = text.split("\n");
  const paragraphs = text.split(/\n\s*\n/).filter((p) => p.trim().length > 0);

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
    setText(""); setTitle(""); setSubject(""); setSceneId(null); setEditorMode("text");
  };
  const openScene = (s: Scene) => {
    setText(s.content); setTitle(s.title); setSubject(s.subject ?? ""); setSceneId(s.id);
    setEditorMode(s.editor_mode === "slides" ? "slides" : "text");
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
        box.scrollTop += speed * dt * (flipV ? -1 : 1);
        // 끝에 도달하면 자동 정지
        if (box.scrollTop >= box.scrollHeight - box.clientHeight - 4 && !flipV) setScrolling(false);
        if (flipV && box.scrollTop <= 0) setScrolling(false);
      }
      rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [scrolling, speed, flipV, mode, editorMode]);

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
     예전엔 재생 중일 때만 방송해서, 일시정지 상태에서 속도를 바꾸면 리모컨엔 안 보이는 버그가 있었다. ── */
  useEffect(() => {
    channelRef.current?.send({
      type: "broadcast", event: "state",
      payload: {
        playing: scrolling, elapsed, speed, flipH, flipV, hAlign, vAlign,
        fontColor, fontFamily, fontSize, paragraphSpacing,
        editorMode, slideIndex, totalSlides: slides.length,
      },
    });
  }, [scrolling, elapsed, speed, flipH, flipV, hAlign, vAlign, fontColor, fontFamily, fontSize, paragraphSpacing, editorMode, slideIndex, slides.length]);

  // 프롬프터 모드를 나갈 때 녹화/스크롤/리모컨 채널이 백그라운드에 남지 않도록 정리한다.
  useEffect(() => {
    if (mode !== "prompt") {
      setScrolling(false);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      if (channelRef.current) { channelRef.current.unsubscribe(); channelRef.current = null; }
      setSessionCode(null);
    }
  }, [mode]);

  // 슬라이드 모드 실행 중 좌우 화살표 키로도 넘길 수 있게.
  useEffect(() => {
    if (mode !== "prompt" || editorMode !== "slides") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") setSlideIndex((i) => Math.min(i + 1, slides.length - 1));
      if (e.key === "ArrowLeft") setSlideIndex((i) => Math.max(i - 1, 0));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mode, editorMode, slides.length]);

  const resetTimer = () => {
    setElapsed(0);
    if (editorMode === "slides") { setSlideIndex(0); return; }
    if (scrollBoxRef.current) scrollBoxRef.current.scrollTop = flipV ? scrollBoxRef.current.scrollHeight : 0;
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

    channel.on("broadcast", { event: "command" }, ({ payload }) => {
      switch (payload.type) {
        case "toggle": setScrolling((v) => !v); break;
        case "play": setScrolling(true); break;
        case "pause": setScrolling(false); break;
        case "restart": setElapsed(0); setSlideIndex(0); if (scrollBoxRef.current) scrollBoxRef.current.scrollTop = 0; break;
        case "nextSlide": setSlideIndex((i) => Math.min(i + 1, slides.length - 1)); break;
        case "prevSlide": setSlideIndex((i) => Math.max(i - 1, 0)); break;
        case "speed": setSpeed(payload.value); break;
        case "flipH": setFlipH((v) => !v); break;
        case "flipV": setFlipV((v) => !v); break;
        case "hAlign": setHAlign(payload.value); break;
        case "vAlign": setVAlign(payload.value); break;
        case "fontColor": setFontColor(payload.value); break;
        case "fontFamily": setFontFamily(payload.value); break;
        case "fontSize": setFontSize(payload.value); break;
        case "paragraphSpacing": setParagraphSpacing(payload.value); break;
      }
    });

    channel.subscribe((status) => {
      // 구독 직후 한 번 방송해둬야 리모컨이 조작하기 전에도 "연결됨"과 현재 설정을 바로 보여준다.
      if (status === "SUBSCRIBED") {
        channel.send({
          type: "broadcast", event: "state",
          payload: {
            playing: false, elapsed: 0, speed, flipH, flipV, hAlign, vAlign,
            fontColor, fontFamily, fontSize, paragraphSpacing,
            editorMode, slideIndex: 0, totalSlides: slides.length,
          },
        });
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

  /* ── 저장/삭제 ── */
  const saveScene = async () => {
    if (!text.trim() || saving || !currentProject) return;
    setSaving(true);
    try {
      const res = await fetch("/api/prompter-scripts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: sceneId, projectId: currentProject.id, title: title || "제목 없는 씬", subject, content: text, editorMode }),
      }).then((r) => r.json());
      if (res.ok) {
        setSceneId(res.script.id); setTitle(res.script.title); setSubject(res.script.subject ?? "");
        await loadScenes(currentProject.id);
      } else {
        alert(res.error || "저장에 실패했습니다.");
      }
    } finally {
      setSaving(false);
    }
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
            <button onClick={saveScene} className="pt-btn" disabled={!text.trim() || saving}><Save size={16} /> {saving ? "저장 중..." : "저장"}</button>
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
              <button onClick={newScene} className="pt-navigator-new"><Plus size={14} /> 새 씬</button>
              {scenesLoading ? (
                <p style={{ color: "#9BB5B0", fontSize: 12, padding: "0 4px" }}>불러오는 중…</p>
              ) : scenes.length === 0 ? (
                <p style={{ color: "#9BB5B0", fontSize: 12, padding: "0 4px" }}>아직 씬이 없어요.</p>
              ) : (
                scenes.map((s) => (
                  <div key={s.id} className={`pt-nav-item${s.id === sceneId ? " active" : ""}`}>
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

              {editorMode === "text" ? (
                <textarea
                  value={text} onChange={(e) => setText(e.target.value)}
                  placeholder="여기에 대본을 입력하세요. 빈 줄로 문단을 구분하면 실행화면에서 문단 간격이 적용됩니다."
                  className="pt-textarea"
                />
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
        {projectModal}
      </main>
    );
  }

  /* ── 프롬프터(전체화면) 실행 모드 ── */
  const isSlideMode = editorMode === "slides";
  return (
    <div style={{ position: "fixed", inset: 0, background: "#000", zIndex: 999 }}>
      {isSlideMode ? (
        <div style={{
          height: "100%", display: "flex", flexDirection: "column",
          justifyContent: vAlign === "top" ? "flex-start" : vAlign === "bottom" ? "flex-end" : "center",
          padding: "0 8vw",
          transform: `scaleX(${flipH ? -1 : 1}) scaleY(${flipV ? -1 : 1})`,
        }}>
          <p style={{ fontSize, color: fontColor, fontFamily, lineHeight: 1.7, whiteSpace: "pre-wrap", margin: 0, textAlign: hAlign, width: "100%" }}>
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
          {paragraphs.map((p, i) => (
            <p key={i} style={{
              fontSize, color: fontColor, fontFamily, lineHeight: 1.7, whiteSpace: "pre-wrap",
              margin: `0 0 ${i < paragraphs.length - 1 ? paragraphSpacing : 0}px`, textAlign: hAlign,
            }}>
              {p}
            </p>
          ))}
        </div>
      )}

      {/* 상단 바 — 타이머는 왼쪽 */}
      <div style={{ position: "fixed", top: 16, left: 16, right: 16, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div className="pt-timer-badge">{fmtTime(elapsed)}</div>
          {isSlideMode && <div className="pt-slide-counter">{slides.length ? slideIndex + 1 : 0} / {slides.length}</div>}
          {recording && <span style={{ color: "#ff5c5c", fontSize: 12, fontWeight: 700, display: "inline-flex", alignItems: "center", gap: 4 }}><Circle size={10} fill="#ff5c5c" /> REC</span>}
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button onClick={() => setShowRemoteInfo(true)} className="pt-icon-btn"><Smartphone size={14} /> 리모컨</button>
          <button onClick={() => setShowControls((v) => !v)} className="pt-icon-btn">{showControls ? "설정 숨기기" : "설정"}</button>
          <button onClick={exitPromptMode} className="pt-icon-btn"><X size={18} /></button>
        </div>
      </div>

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
              <button onClick={() => setScrolling((v) => !v)} className="pt-ctrl-btn">
                {scrolling ? <Pause size={18} /> : <Play size={18} />} {scrolling ? "일시정지" : "재생"}
              </button>
              <button onClick={resetTimer} className="pt-ctrl-btn"><RotateCcw size={18} /> 처음으로</button>

              <label className="pt-ctrl-label"><Gauge size={14} /> 속도
                <input type="range" min={5} max={200} value={speed} onChange={(e) => setSpeed(Number(e.target.value))} style={{ accentColor: "#e85d2c" }} />
              </label>

              <label className="pt-ctrl-label"><AlignVerticalSpaceAround size={14} /> 문단간격
                <input type="range" min={0} max={120} value={paragraphSpacing} onChange={(e) => setParagraphSpacing(Number(e.target.value))} style={{ accentColor: "#e85d2c" }} />
              </label>
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
