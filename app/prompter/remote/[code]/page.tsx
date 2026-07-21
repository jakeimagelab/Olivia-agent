"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import type { RealtimeChannel } from "@supabase/supabase-js";
import {
  Play, Pause, RotateCcw, FlipHorizontal, FlipVertical, Gauge, Type,
  AlignLeft, AlignCenter, AlignRight,
  AlignVerticalJustifyStart, AlignVerticalJustifyCenter, AlignVerticalJustifyEnd,
  Mic, Square, ChevronLeft, ChevronRight, AlignVerticalSpaceAround,
} from "lucide-react";
import { getSupabase } from "@/lib/supabase";
import { FONT_OPTIONS, COLOR_OPTIONS, fmtTime, type HAlign, type VAlign } from "@/lib/prompter/constants";

// 구형 Safari 등 지원 코덱이 다를 수 있어 순서대로 확인 후 첫 번째 지원되는 것을 쓴다.
function pickSupportedAudioMimeType(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];
  return candidates.find((t) => MediaRecorder.isTypeSupported?.(t));
}

const orangeRange = { accentColor: "#e85d2c", width: "100%" } as const;

export default function PrompterRemotePage() {
  const params = useParams();
  const code = String(params.code);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const [connected, setConnected] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [speed, setSpeed] = useState(40);
  const [flipH, setFlipH] = useState(false);
  const [flipV, setFlipV] = useState(false);
  const [hAlign, setHAlign] = useState<HAlign>("left");
  const [vAlign, setVAlign] = useState<VAlign>("center");
  const [fontColor, setFontColor] = useState("#FFFFFF");
  const [fontFamily, setFontFamily] = useState(FONT_OPTIONS[0].value);
  const [fontSize, setFontSize] = useState(48);
  const [paragraphSpacing, setParagraphSpacing] = useState(28);
  const [editorMode, setEditorMode] = useState<"text" | "slides">("text");
  const [slideIndex, setSlideIndex] = useState(0);
  const [totalSlides, setTotalSlides] = useState(0);

  // 화면이 꺼지지 않게 — 촬영 중 리모컨을 보다가 폰이 잠들어 조작이 끊기는 걸 막는다.
  const wakeLockRef = useRef<{ release: () => Promise<void> } | null>(null);
  useEffect(() => {
    const nav = navigator as Navigator & { wakeLock?: { request: (type: "screen") => Promise<{ release: () => Promise<void> }> } };
    if (!nav.wakeLock) return;
    let cancelled = false;
    const acquire = async () => {
      try {
        const lock = await nav.wakeLock!.request("screen");
        if (cancelled) { lock.release().catch(() => {}); return; }
        wakeLockRef.current = lock;
      } catch { /* 권한 거부 등 — 조용히 무시, 리모컨 자체 동작엔 영향 없음 */ }
    };
    acquire();
    const onVisible = () => { if (document.visibilityState === "visible") acquire(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      wakeLockRef.current?.release().catch(() => {});
      wakeLockRef.current = null;
    };
  }, []);

  useEffect(() => {
    const supabase = getSupabase();
    const channel = supabase.channel(`prompter-${code}`, { config: { broadcast: { self: false } } });
    channel.on("broadcast", { event: "state" }, ({ payload }) => {
      setConnected(true);
      setPlaying(payload.playing);
      setElapsed(payload.elapsed);
      setSpeed(payload.speed);
      if (payload.flipH != null) setFlipH(payload.flipH);
      if (payload.flipV != null) setFlipV(payload.flipV);
      if (payload.hAlign) setHAlign(payload.hAlign);
      if (payload.vAlign) setVAlign(payload.vAlign);
      if (payload.fontColor) setFontColor(payload.fontColor);
      if (payload.fontFamily) setFontFamily(payload.fontFamily);
      if (payload.fontSize) setFontSize(payload.fontSize);
      if (payload.paragraphSpacing != null) setParagraphSpacing(payload.paragraphSpacing);
      if (payload.editorMode) setEditorMode(payload.editorMode);
      if (payload.slideIndex != null) setSlideIndex(payload.slideIndex);
      if (payload.totalSlides != null) setTotalSlides(payload.totalSlides);
    });
    channel.subscribe();
    channelRef.current = channel;
    return () => { channel.unsubscribe(); };
  }, [code]);

  const send = (type: string, value?: unknown) => {
    channelRef.current?.send({ type: "broadcast", event: "command", payload: { type, value } });
  };

  /* ── 음성 녹음 (폰을 보조 오디오로 쓸 때) ── */
  const [recording, setRecording] = useState(false);
  const [recordedUrl, setRecordedUrl] = useState<string | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];
      const mimeType = pickSupportedAudioMimeType();
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeType || "audio/webm" });
        setRecordedUrl(URL.createObjectURL(blob));
        stream.getTracks().forEach((t) => t.stop());
      };
      recorder.start();
      recorderRef.current = recorder;
      setRecording(true);
    } catch (err) {
      alert("마이크 권한이 필요합니다: " + (err instanceof Error ? err.message : String(err)));
    }
  }, []);
  const stopRecording = useCallback(() => {
    recorderRef.current?.stop();
    setRecording(false);
  }, []);
  useEffect(() => () => { streamRef.current?.getTracks().forEach((t) => t.stop()); }, []);

  const isSlideMode = editorMode === "slides";

  return (
    <main style={{ minHeight: "100dvh", background: "#0d1f1e", color: "#fff", padding: 20, display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ textAlign: "center" }}>
        <p style={{ fontSize: 12, color: connected ? "#5cff8f" : "#ff9c5c", fontWeight: 700 }}>
          {connected ? "● 연결됨" : "○ 프롬프터 연결 대기 중…"}
        </p>
        <p style={{ fontSize: 40, fontWeight: 900, fontVariantNumeric: "tabular-nums" }}>{fmtTime(elapsed)}</p>
        {isSlideMode && <p style={{ fontSize: 13, color: "#9BB5B0", fontWeight: 700, marginTop: 2 }}>{totalSlides ? slideIndex + 1 : 0} / {totalSlides}</p>}
      </div>

      {isSlideMode ? (
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={() => send("prevSlide")} style={{ flex: 1, padding: "24px 0", borderRadius: 20, background: "rgba(255,255,255,.1)", border: "none", color: "#fff", fontSize: 16, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
            <ChevronLeft size={22} /> 이전
          </button>
          <button onClick={() => send("nextSlide")} style={{ flex: 1, padding: "24px 0", borderRadius: 20, background: "#155855", border: "none", color: "#fff", fontSize: 16, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
            다음 <ChevronRight size={22} />
          </button>
        </div>
      ) : (
        <button
          onClick={() => send("toggle")}
          style={{ padding: "24px 0", borderRadius: 20, background: playing ? "#e85d2c" : "#155855", border: "none", color: "#fff", fontSize: 20, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", gap: 10 }}
        >
          {playing ? <><Pause size={24} /> 일시정지</> : <><Play size={24} /> 재생</>}
        </button>
      )}

      <button onClick={() => send("restart")} style={{ padding: 14, borderRadius: 16, background: "rgba(255,255,255,.1)", border: "none", color: "#fff", fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
        <RotateCcw size={18} /> 처음으로
      </button>

      <div style={{ display: "flex", gap: 10 }}>
        <button onClick={() => { setFlipH((v) => !v); send("flipH"); }} style={{ flex: 1, padding: 14, borderRadius: 16, background: flipH ? "#e85d2c" : "rgba(255,255,255,.1)", border: "none", color: "#fff", fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
          <FlipHorizontal size={18} /> 좌우반전
        </button>
        <button onClick={() => { setFlipV((v) => !v); send("flipV"); }} style={{ flex: 1, padding: 14, borderRadius: 16, background: flipV ? "#e85d2c" : "rgba(255,255,255,.1)", border: "none", color: "#fff", fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
          <FlipVertical size={18} /> 상하반전
        </button>
      </div>

      {!isSlideMode && (
        <>
          <div>
            <label style={{ fontSize: 13, fontWeight: 700, display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
              <Gauge size={16} /> 속도 ({speed})
            </label>
            <input
              type="range" min={5} max={200} value={speed}
              onChange={(e) => { const v = Number(e.target.value); setSpeed(v); send("speed", v); }}
              style={orangeRange}
            />
          </div>
          <div>
            <label style={{ fontSize: 13, fontWeight: 700, display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
              <AlignVerticalSpaceAround size={16} /> 문단 간격 ({paragraphSpacing})
            </label>
            <input
              type="range" min={0} max={120} value={paragraphSpacing}
              onChange={(e) => { const v = Number(e.target.value); setParagraphSpacing(v); send("paragraphSpacing", v); }}
              style={orangeRange}
            />
          </div>
        </>
      )}

      <div>
        <label style={{ fontSize: 13, fontWeight: 700, display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
          <Type size={16} /> 글자 크기 ({fontSize})
        </label>
        <input
          type="range" min={20} max={120} value={fontSize}
          onChange={(e) => { const v = Number(e.target.value); setFontSize(v); send("fontSize", v); }}
          style={orangeRange}
        />
      </div>

      <div style={{ display: "flex", gap: 8 }}>
        {(["left", "center", "right"] as const).map((v) => (
          <button key={v} onClick={() => { setHAlign(v); send("hAlign", v); }}
            style={{ flex: 1, padding: 12, borderRadius: 12, background: hAlign === v ? "#e85d2c" : "rgba(255,255,255,.1)", border: "none", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center" }}>
            {v === "left" ? <AlignLeft size={16} /> : v === "center" ? <AlignCenter size={16} /> : <AlignRight size={16} />}
          </button>
        ))}
        {(["top", "center", "bottom"] as const).map((v) => (
          <button key={v} onClick={() => { setVAlign(v); send("vAlign", v); }}
            style={{ flex: 1, padding: 12, borderRadius: 12, background: vAlign === v ? "#e85d2c" : "rgba(255,255,255,.1)", border: "none", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center" }}>
            {v === "top" ? <AlignVerticalJustifyStart size={16} /> : v === "center" ? <AlignVerticalJustifyCenter size={16} /> : <AlignVerticalJustifyEnd size={16} />}
          </button>
        ))}
      </div>

      <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
        {COLOR_OPTIONS.map((c) => (
          <button key={c} onClick={() => { setFontColor(c); send("fontColor", c); }}
            style={{ width: 34, height: 34, borderRadius: 9, background: c, border: fontColor === c ? "3px solid #e85d2c" : "2px solid rgba(255,255,255,.3)" }} />
        ))}
      </div>

      <select value={fontFamily} onChange={(e) => { setFontFamily(e.target.value); send("fontFamily", e.target.value); }}
        style={{ width: "100%", padding: 12, borderRadius: 12, background: "rgba(255,255,255,.1)", border: "1px solid rgba(255,255,255,.2)", color: "#fff", fontSize: 14 }}>
        {FONT_OPTIONS.map((f) => <option key={f.value} value={f.value} style={{ color: "#000" }}>{f.label}</option>)}
      </select>

      <div style={{ borderTop: "1px solid rgba(255,255,255,.12)", paddingTop: 16 }}>
        <label style={{ fontSize: 13, fontWeight: 700, display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
          <Mic size={16} /> 보조 음성 녹음
        </label>
        {!recording ? (
          <button onClick={startRecording} style={{ width: "100%", padding: 14, borderRadius: 16, background: "rgba(255,92,92,.15)", border: "1px solid rgba(255,92,92,.4)", color: "#ff8080", fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
            <Mic size={18} /> 녹음 시작
          </button>
        ) : (
          <button onClick={stopRecording} style={{ width: "100%", padding: 14, borderRadius: 16, background: "#e85d2c", border: "none", color: "#fff", fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
            <Square size={18} /> 녹음 종료
          </button>
        )}
        {recordedUrl && (
          <div style={{ marginTop: 12 }}>
            <audio src={recordedUrl} controls style={{ width: "100%" }} />
            <a href={recordedUrl} download={`prompter-audio-${Date.now()}.webm`}
              style={{ display: "block", textAlign: "center", marginTop: 8, padding: 10, borderRadius: 10, background: "#155855", color: "#fff", fontWeight: 700, textDecoration: "none", fontSize: 13 }}>
              다운로드
            </a>
          </div>
        )}
      </div>
    </main>
  );
}
