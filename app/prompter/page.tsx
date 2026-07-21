"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import {
  FlipHorizontal, FlipVertical, Play, Pause, RotateCcw,
  Circle, Square, Save, FolderOpen, Type, Palette, Gauge, X, Trash2,
} from "lucide-react";

type SavedScript = { id: string; title: string; content: string; updated_at: string };

const FONT_OPTIONS = [
  { label: "고딕", value: "'Noto Sans KR', sans-serif" },
  { label: "명조", value: "'Noto Serif KR', serif" },
  { label: "시스템", value: "-apple-system, BlinkMacSystemFont, sans-serif" },
];
const COLOR_OPTIONS = ["#FFFFFF", "#FFD400", "#FF5C5C", "#5CFF8F", "#5CB8FF"];

// Chrome은 vp9가 안정적이지만 지원하지 않는 브라우저(구형 Chrome, 일부 Safari)에서
// new MediaRecorder(...)가 바로 예외를 던지지 않도록 지원 코덱을 순서대로 확인한다.
function pickSupportedMimeType(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  const candidates = ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"];
  return candidates.find((t) => MediaRecorder.isTypeSupported?.(t));
}

export default function PrompterPage() {
  const [mode, setMode] = useState<"edit" | "prompt">("edit");
  const [text, setText] = useState("");
  const [title, setTitle] = useState("");
  const [scriptId, setScriptId] = useState<string | null>(null);
  const [savedScripts, setSavedScripts] = useState<SavedScript[]>([]);
  const [showLibrary, setShowLibrary] = useState(false);
  const [saving, setSaving] = useState(false);

  // 프롬프터 설정
  const [flipH, setFlipH] = useState(false);
  const [flipV, setFlipV] = useState(false);
  const [fontSize, setFontSize] = useState(48);
  const [fontColor, setFontColor] = useState("#FFFFFF");
  const [fontFamily, setFontFamily] = useState(FONT_OPTIONS[0].value);
  const [speed, setSpeed] = useState(40); // px/sec
  const [scrolling, setScrolling] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [showControls, setShowControls] = useState(true);

  // 녹화
  const [recording, setRecording] = useState(false);
  const [recordedUrl, setRecordedUrl] = useState<string | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const videoPreviewRef = useRef<HTMLVideoElement>(null);

  const scrollBoxRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number | null>(null);
  const lastTsRef = useRef<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  /* ── 자동 스크롤 ── */
  useEffect(() => {
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
  }, [scrolling, speed, flipV]);

  /* ── 타이머 ── */
  useEffect(() => {
    if (scrolling) {
      timerRef.current = setInterval(() => setElapsed((e) => e + 1), 1000);
    } else if (timerRef.current) {
      clearInterval(timerRef.current);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [scrolling]);

  // 프롬프터 모드를 나갈 때 녹화/스크롤이 백그라운드에 남지 않도록 정리한다.
  useEffect(() => {
    if (mode !== "prompt") {
      setScrolling(false);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }, [mode]);

  const resetTimer = () => { setElapsed(0); if (scrollBoxRef.current) scrollBoxRef.current.scrollTop = flipV ? scrollBoxRef.current.scrollHeight : 0; };
  const fmtTime = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

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

  /* ── 저장/불러오기 ── */
  const loadScripts = async () => {
    const res = await fetch("/api/prompter-scripts").then((r) => r.json());
    setSavedScripts(res.scripts ?? []);
  };
  const saveScript = async () => {
    if (!text.trim() || saving) return;
    setSaving(true);
    try {
      const res = await fetch("/api/prompter-scripts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: scriptId, title: title || "제목 없는 대본", content: text }),
      }).then((r) => r.json());
      if (res.ok) { setScriptId(res.script.id); setTitle(res.script.title); }
      else alert(res.error || "저장에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  };
  const deleteScript = async (id: string) => {
    if (!confirm("이 대본을 삭제할까요?")) return;
    const res = await fetch(`/api/prompter-scripts/${id}`, { method: "DELETE" }).then((r) => r.json());
    if (res.ok) {
      setSavedScripts((prev) => prev.filter((s) => s.id !== id));
      if (scriptId === id) setScriptId(null);
    } else {
      alert(res.error || "삭제에 실패했습니다.");
    }
  };

  /* ── 편집 모드 ── */
  if (mode === "edit") {
    return (
      <main className="oa-page" style={{ maxWidth: 900 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h1 style={{ fontSize: 28, fontWeight: 900, margin: 0 }}>프롬프터</h1>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => { loadScripts(); setShowLibrary(true); }} className="pt-btn"><FolderOpen size={16} /> 불러오기</button>
            <button onClick={saveScript} className="pt-btn" disabled={!text.trim() || saving}><Save size={16} /> {saving ? "저장 중..." : "저장"}</button>
            <button onClick={() => setMode("prompt")} className="pt-btn pt-btn-primary" disabled={!text.trim()}>편집 후 실행 →</button>
          </div>
        </div>
        <input
          value={title} onChange={(e) => setTitle(e.target.value)} placeholder="대본 제목"
          style={{ width: "100%", padding: "10px 14px", fontSize: 15, fontWeight: 700, border: "1px solid #E0E8E6", borderRadius: 10, marginBottom: 10 }}
        />
        <textarea
          value={text} onChange={(e) => setText(e.target.value)}
          placeholder="여기에 대본을 입력하세요. 문단은 그대로 스크롤 화면에 반영됩니다."
          style={{ width: "100%", minHeight: 520, padding: 20, fontSize: 17, lineHeight: 1.9, border: "1px solid #E0E8E6", borderRadius: 14, resize: "vertical", fontFamily: "'Noto Sans KR', sans-serif" }}
        />

        {showLibrary && (
          <div className="pt-modal-backdrop" onClick={() => setShowLibrary(false)}>
            <div className="pt-modal" onClick={(e) => e.stopPropagation()}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
                <strong>저장된 대본</strong>
                <button onClick={() => setShowLibrary(false)}><X size={18} /></button>
              </div>
              {savedScripts.length === 0 && <p style={{ color: "#8aa39f", fontSize: 13 }}>저장된 대본이 없어요.</p>}
              {savedScripts.map((s) => (
                <div key={s.id} className="pt-script-item">
                  <button className="pt-script-item-main" onClick={() => { setText(s.content); setTitle(s.title); setScriptId(s.id); setShowLibrary(false); }}>
                    <strong>{s.title}</strong>
                    <span>{new Date(s.updated_at).toLocaleString("ko-KR")}</span>
                  </button>
                  <button className="pt-script-item-delete" onClick={() => deleteScript(s.id)} title="삭제"><Trash2 size={14} /></button>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
    );
  }

  /* ── 프롬프터(전체화면) 모드 ── */
  return (
    <div style={{ position: "fixed", inset: 0, background: "#000", zIndex: 999 }}>
      <div
        ref={scrollBoxRef}
        style={{
          height: "100%", overflowY: "auto", padding: "50vh 8vw",
          transform: `scaleX(${flipH ? -1 : 1}) scaleY(${flipV ? -1 : 1})`,
        }}
      >
        <p style={{ fontSize: fontSize, color: fontColor, fontFamily, lineHeight: 1.7, whiteSpace: "pre-wrap", margin: 0 }}>
          {text}
        </p>
      </div>

      {/* 상단 타이머 + 종료 */}
      <div style={{ position: "fixed", top: 16, left: 16, right: 16, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ color: "#fff", fontSize: 22, fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>{fmtTime(elapsed)}</div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {recording && <span style={{ color: "#ff5c5c", fontSize: 12, fontWeight: 700, display: "flex", alignItems: "center", gap: 4 }}><Circle size={10} fill="#ff5c5c" /> REC</span>}
          <button onClick={() => setShowControls((v) => !v)} className="pt-icon-btn">{showControls ? "설정 숨기기" : "설정"}</button>
          <button onClick={() => { setMode("edit"); if (recording) stopRecording(); }} className="pt-icon-btn"><X size={18} /></button>
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
          <button onClick={() => setScrolling((v) => !v)} className="pt-ctrl-btn">
            {scrolling ? <Pause size={18} /> : <Play size={18} />} {scrolling ? "일시정지" : "재생"}
          </button>
          <button onClick={resetTimer} className="pt-ctrl-btn"><RotateCcw size={18} /> 처음으로</button>

          <label className="pt-ctrl-label"><Gauge size={14} /> 속도
            <input type="range" min={5} max={200} value={speed} onChange={(e) => setSpeed(Number(e.target.value))} />
          </label>

          <button onClick={() => setFlipH((v) => !v)} className={`pt-ctrl-btn${flipH ? " active" : ""}`}><FlipHorizontal size={16} /> 좌우반전</button>
          <button onClick={() => setFlipV((v) => !v)} className={`pt-ctrl-btn${flipV ? " active" : ""}`}><FlipVertical size={16} /> 상하반전</button>

          <label className="pt-ctrl-label"><Type size={14} /> 크기
            <input type="range" min={20} max={120} value={fontSize} onChange={(e) => setFontSize(Number(e.target.value))} />
          </label>

          <label className="pt-ctrl-label"><Palette size={14} />
            <select value={fontColor} onChange={(e) => setFontColor(e.target.value)}>
              {COLOR_OPTIONS.map((c) => <option key={c} value={c} style={{ background: c }}>{c}</option>)}
            </select>
          </label>

          <select value={fontFamily} onChange={(e) => setFontFamily(e.target.value)} className="pt-ctrl-select">
            {FONT_OPTIONS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
          </select>

          {!recording ? (
            <button onClick={startRecording} className="pt-ctrl-btn pt-rec-btn"><Circle size={16} /> 녹화 시작</button>
          ) : (
            <button onClick={stopRecording} className="pt-ctrl-btn pt-rec-btn active"><Square size={16} /> 녹화 종료</button>
          )}
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
