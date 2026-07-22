"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import type { RealtimeChannel } from "@supabase/supabase-js";
import {
  Play, Pause, RotateCcw, FlipHorizontal, FlipVertical, Gauge, Type,
  AlignLeft, AlignCenter, AlignRight,
  AlignVerticalJustifyStart, AlignVerticalJustifyCenter, AlignVerticalJustifyEnd,
  Mic, Square, ChevronLeft, ChevronRight, AlignVerticalSpaceAround, AlignVerticalDistributeCenter,
  Scan, Palette, Maximize, Minimize,
} from "lucide-react";
import { getSupabase } from "@/lib/supabase";
import {
  FONT_OPTIONS, COLOR_OPTIONS, BG_COLOR_OPTIONS, fmtTime,
  SPEED_LEVELS, PARAGRAPH_SPACING_LEVELS, FONT_SIZE_LEVELS, levelOf,
  type HAlign, type VAlign,
} from "@/lib/prompter/constants";
import {
  REMOTE_DISPLAY_MODE_STORAGE_KEY,
  isRemoteDisplayMode,
  recommendRemoteDisplayMode,
  type RemoteDisplayMode,
} from "@/lib/prompter/remoteDisplayMode";

// 구형 Safari 등 지원 코덱이 다를 수 있어 순서대로 확인 후 첫 번째 지원되는 것을 쓴다.
function pickSupportedAudioMimeType(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];
  return candidates.find((t) => MediaRecorder.isTypeSupported?.(t));
}

const orangeRange = { accentColor: "#e85d2c", flex: 1, minWidth: 0 } as const;

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
  const [bgColor, setBgColor] = useState("#000000");
  const [lineHeight, setLineHeight] = useState(1.7);
  const [editorMode, setEditorMode] = useState<"text" | "slides">("text");
  const [slideIndex, setSlideIndex] = useState(0);
  const [totalSlides, setTotalSlides] = useState(0);
  const [paragraphIndex, setParagraphIndex] = useState(0);
  const [totalParagraphs, setTotalParagraphs] = useState(0);
  const [scrollProgress, setScrollProgress] = useState(0);
  const [guideEnabled, setGuideEnabled] = useState(false);
  const [guidePosition, setGuidePosition] = useState(40);
  const [guideHighlight, setGuideHighlight] = useState(false);
  const [displayMode, setDisplayMode] = useState<RemoteDisplayMode>("remote");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [hostViewport, setHostViewport] = useState({ width: 1280, height: 720 });
  const [mirrorScale, setMirrorScale] = useState(1);

  useEffect(() => {
    const savedMode = window.localStorage.getItem(REMOTE_DISPLAY_MODE_STORAGE_KEY);
    setDisplayMode(isRemoteDisplayMode(savedMode) ? savedMode : recommendRemoteDisplayMode({
      userAgent: navigator.userAgent,
      maxTouchPoints: navigator.maxTouchPoints,
      screenWidth: window.screen.width,
      screenHeight: window.screen.height,
    }));
    const onFullscreen = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onFullscreen);
    return () => {
      document.removeEventListener("fullscreenchange", onFullscreen);
    };
  }, []);

  // 실행화면 미리보기 — 실제 대본 내용을 받아서 그대로 축소 표시하고, 직접 드래그해서 스크롤 위치를 지정할 수 있다.
  type PreviewSpeaker = { id: string; name: string; color: string };
  const [previewParagraphs, setPreviewParagraphs] = useState<string[]>([]);
  const [previewSlides, setPreviewSlides] = useState<string[]>([]);
  const [previewSpeakers, setPreviewSpeakers] = useState<PreviewSpeaker[]>([]);
  const [previewSpeakerMap, setPreviewSpeakerMap] = useState<string[]>([]);
  const [previewGestureMap, setPreviewGestureMap] = useState<string[]>([]);
  const previewFrameRef = useRef<HTMLDivElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const isDraggingPreviewRef = useRef(false);
  const lastSeekSentRef = useRef(0);

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
      if (payload.bgColor) setBgColor(payload.bgColor);
      if (payload.lineHeight != null) setLineHeight(payload.lineHeight);
      if (payload.guideEnabled != null) setGuideEnabled(payload.guideEnabled);
      if (payload.guidePosition != null) setGuidePosition(payload.guidePosition);
      if (payload.guideHighlight != null) setGuideHighlight(payload.guideHighlight);
      if (payload.editorMode) setEditorMode(payload.editorMode);
      if (payload.slideIndex != null) setSlideIndex(payload.slideIndex);
      if (payload.totalSlides != null) setTotalSlides(payload.totalSlides);
      if (payload.paragraphIndex != null) setParagraphIndex(payload.paragraphIndex);
      if (payload.totalParagraphs != null) setTotalParagraphs(payload.totalParagraphs);
      if (payload.scrollProgress != null) setScrollProgress(payload.scrollProgress);
      if (payload.viewportWidth && payload.viewportHeight) {
        setHostViewport({ width: Number(payload.viewportWidth), height: Number(payload.viewportHeight) });
      }
      // 미리보기를 손으로 드래그하는 동안엔 실행화면 쪽 위치로 되돌리지 않는다 (터치가 끝나면 다시 따라간다).
      if (payload.scrollProgress != null && !isDraggingPreviewRef.current) {
        const el = previewRef.current;
        if (el) {
          const max = el.scrollHeight - el.clientHeight;
          el.scrollTop = max > 0 ? payload.scrollProgress * max : 0;
        }
      }
    });
    channel.on("broadcast", { event: "frame" }, ({ payload }) => {
      if (typeof payload.scrollProgress !== "number" || isDraggingPreviewRef.current) return;
      setScrollProgress(payload.scrollProgress);
      const el = previewRef.current;
      if (el) {
        const max = el.scrollHeight - el.clientHeight;
        el.scrollTop = max > 0 ? payload.scrollProgress * max : 0;
      }
    });
    channel.on("broadcast", { event: "content" }, ({ payload }) => {
      setPreviewParagraphs(payload.paragraphs ?? []);
      setPreviewSlides(payload.slides ?? []);
      setPreviewSpeakers(payload.speakers ?? []);
      setPreviewSpeakerMap(payload.speakerMap ?? []);
      setPreviewGestureMap(payload.gestureMap ?? []);
    });
    channel.subscribe((status) => {
      // 실행화면이 먼저 켜져 있다가 리모컨이 나중에 접속하는 경우가 많아, 접속 직후 내용을 다시 요청한다.
      if (status === "SUBSCRIBED") {
        channel.send({ type: "broadcast", event: "command", payload: { type: "requestContent" } });
      }
    });
    channelRef.current = channel;
    return () => { channel.unsubscribe(); };
  }, [code]);

  const send = (type: string, value?: unknown) => {
    channelRef.current?.send({ type: "broadcast", event: "command", payload: { type, value } });
  };
  const toggleFullscreen = () => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else document.documentElement.requestFullscreen().catch(() => {});
  };
  const selectDisplayMode = (mode: RemoteDisplayMode) => {
    setDisplayMode(mode);
    window.localStorage.setItem(REMOTE_DISPLAY_MODE_STORAGE_KEY, mode);
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
  const isMirrorMode = displayMode === "mirror";
  const vAlignPercent = vAlign === "top" ? 12 : vAlign === "bottom" ? 88 : 50;
  const tabletTransform = `translateX(-50%) scale(${mirrorScale}) scaleX(${flipH ? -1 : 1}) scaleY(${flipV ? -1 : 1})`;

  useEffect(() => {
    if (!isMirrorMode) return;
    const frame = previewFrameRef.current;
    if (!frame) return;
    const updateScale = () => {
      const rect = frame.getBoundingClientRect();
      setMirrorScale(Math.max(.05, Math.min(rect.width / hostViewport.width, rect.height / hostViewport.height)));
    };
    updateScale();
    const observer = new ResizeObserver(updateScale);
    observer.observe(frame);
    return () => observer.disconnect();
  }, [isMirrorMode, hostViewport.width, hostViewport.height]);

  return (
    <main className={`pt-remote-page ${displayMode}`} style={{ height: "100dvh", background: "#0d1f1e", color: "#fff", padding: isMirrorMode ? "8px 12px 36dvh" : "10px 14px", display: "flex", flexDirection: "column", gap: 7, overflowY: "auto", boxSizing: "border-box" }}>
      <div style={{ textAlign: "center", position: "relative" }}>
        <p style={{ fontSize: 11, color: connected ? "#5cff8f" : "#ff9c5c", fontWeight: 700 }}>
          {connected ? "● 연결됨" : "○ 프롬프터 연결 대기 중…"}
        </p>
        <p style={{ fontSize: 28, fontWeight: 900, fontVariantNumeric: "tabular-nums", lineHeight: 1.2 }}>{fmtTime(elapsed)}</p>
        {isSlideMode
          ? <p style={{ fontSize: 11, color: "#9BB5B0", fontWeight: 700 }}>{totalSlides ? slideIndex + 1 : 0} / {totalSlides}</p>
          : totalParagraphs > 0 && <p style={{ fontSize: 11, color: "#9BB5B0", fontWeight: 700 }}>{paragraphIndex + 1} / {totalParagraphs} 문단</p>}
        <button onClick={toggleFullscreen} aria-label={isFullscreen ? "전체화면 종료" : "전체화면"} style={{ position: "absolute", right: 0, top: 2, width: 34, height: 34, borderRadius: 10, border: "1px solid rgba(255,255,255,.2)", background: "rgba(255,255,255,.1)", color: "#fff", display: "grid", placeItems: "center" }}>
          {isFullscreen ? <Minimize size={16} /> : <Maximize size={16} />}
        </button>
      </div>

      <div className="pt-remote-mode-switch" role="group" aria-label="리모트 화면 모드">
        <button className={displayMode === "remote" ? "active" : ""} onClick={() => selectDisplayMode("remote")}>리모트 모드</button>
        <button className={displayMode === "mirror" ? "active" : ""} onClick={() => selectDisplayMode("mirror")}>미러링 모드</button>
      </div>

      {/* 실행화면 진행률 바 — 직접 드래그해서 원하는 위치로 바로 이동시킬 수 있다 (스크러버). */}
      {!isSlideMode && (
        <div
          onPointerDown={(e) => {
            isDraggingPreviewRef.current = true;
            (e.target as HTMLElement).setPointerCapture(e.pointerId);
            const rect = e.currentTarget.getBoundingClientRect();
            const p = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
            setScrollProgress(p);
            send("seek", p);
          }}
          onPointerMove={(e) => {
            if (!isDraggingPreviewRef.current) return;
            const rect = e.currentTarget.getBoundingClientRect();
            const p = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
            setScrollProgress(p);
            const now = Date.now();
            if (now - lastSeekSentRef.current > 80) {
              lastSeekSentRef.current = now;
              send("seek", p);
            }
          }}
          onPointerUp={() => { isDraggingPreviewRef.current = false; }}
          onPointerCancel={() => { isDraggingPreviewRef.current = false; }}
          style={{ height: 18, display: "flex", alignItems: "center", cursor: "pointer", touchAction: "none" }}
        >
          <div style={{ width: "100%", height: 6, borderRadius: 999, background: "rgba(255,255,255,.15)", overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${scrollProgress * 100}%`, background: "#e85d2c", transition: isDraggingPreviewRef.current ? "none" : "width .2s linear" }} />
          </div>
        </div>
      )}

      {/* 실행화면 미리보기 — 실제 대본이 그대로 보이고, 손가락으로 직접 스크롤해서 위치를 옮길 수 있다 */}
      <div ref={previewFrameRef} style={{ position: "relative", flex: isMirrorMode ? "1 1 auto" : "none", minHeight: 0, overflow: "hidden", borderRadius: 14, background: bgColor }}>
        <div
          ref={previewRef}
          onPointerDown={() => { isDraggingPreviewRef.current = true; }}
          onPointerUp={() => { isDraggingPreviewRef.current = false; }}
          onPointerCancel={() => { isDraggingPreviewRef.current = false; }}
          onScroll={() => {
            const el = previewRef.current;
            if (!el || isSlideMode || !isDraggingPreviewRef.current) return;
            const max = el.scrollHeight - el.clientHeight;
            const progress = max > 0 ? el.scrollTop / max : 0;
            const now = Date.now();
            if (now - lastSeekSentRef.current > 80) {
              lastSeekSentRef.current = now;
              send("seek", progress);
            }
          }}
          style={{
            position: isMirrorMode ? "absolute" : "relative", left: isMirrorMode ? "50%" : "auto", top: 0,
            width: isMirrorMode ? hostViewport.width : "100%", height: isMirrorMode ? hostViewport.height : 150,
            minHeight: isMirrorMode ? 0 : 150, overflowY: isSlideMode ? "hidden" : "auto", background: bgColor,
            borderRadius: isMirrorMode ? 0 : 14,
            padding: isMirrorMode && !isSlideMode
              ? `${hostViewport.height * Math.max(vAlignPercent, guidePosition) / 100}px ${hostViewport.width * .08}px ${hostViewport.height * Math.max(100 - vAlignPercent, 100 - guidePosition) / 100}px`
              : isMirrorMode ? `0 ${hostViewport.width * .08}px` : "10px 14px",
            border: isMirrorMode ? "none" : "1px solid rgba(255,255,255,.15)",
            display: "flex", flexDirection: "column",
            justifyContent: isSlideMode ? (vAlign === "top" ? "flex-start" : vAlign === "bottom" ? "flex-end" : "center") : "flex-start",
            transform: isMirrorMode ? tabletTransform : `scaleX(${flipH ? -1 : 1}) scaleY(${flipV ? -1 : 1})`,
            transformOrigin: isMirrorMode ? "top center" : "center",
          }}
        >
        {isSlideMode ? (
          <p style={{ color: fontColor, fontFamily, fontSize: isMirrorMode ? fontSize : Math.max(10, fontSize * 0.22), lineHeight, textAlign: hAlign, whiteSpace: "pre-wrap", margin: 0 }}>
            {previewSlides[slideIndex] ?? ""}
            {previewGestureMap[slideIndex]?.trim() && <span className="pt-remote-gesture">({previewGestureMap[slideIndex].trim()})</span>}
          </p>
        ) : previewParagraphs.length === 0 ? (
          <p style={{ color: "#6a8e8a", fontSize: 12, textAlign: "center", margin: "auto" }}>미리보기 연결 중…</p>
        ) : (
          previewParagraphs.map((p, i) => {
            const sp = previewSpeakers.find((s) => s.id === previewSpeakerMap[i]);
            return (
              <p key={i} style={{
                color: fontColor, fontFamily, fontSize: isMirrorMode ? fontSize : Math.max(10, fontSize * 0.22), textAlign: hAlign, lineHeight,
                whiteSpace: "pre-wrap", margin: `0 0 ${isMirrorMode ? paragraphSpacing : Math.max(4, paragraphSpacing * 0.22)}px`,
                borderLeft: sp ? `3px solid ${sp.color}` : "none", paddingLeft: sp ? 6 : 0,
                background: guideHighlight && paragraphIndex === i ? "rgba(232,93,44,.16)" : "transparent",
                borderRadius: guideHighlight && paragraphIndex === i ? 10 : 0,
              }}>
                {p}
                {previewGestureMap[i]?.trim() && <span className="pt-remote-gesture">({previewGestureMap[i].trim()})</span>}
              </p>
            );
          })
        )}
        </div>
        {guideEnabled && !isSlideMode && (
          <div style={{ position: "absolute", top: 0, left: isMirrorMode ? "50%" : 0, right: isMirrorMode ? "auto" : 0, width: isMirrorMode ? hostViewport.width : "auto", height: isMirrorMode ? hostViewport.height : "100%", transform: isMirrorMode ? `translateX(-50%) scale(${mirrorScale})` : "none", transformOrigin: "top center", pointerEvents: "none", zIndex: 2 }}>
            <div style={{ position: "absolute", top: `${guidePosition}%`, left: 0, right: 0, borderTop: "2px dashed rgba(232,93,44,.9)" }} />
          </div>
        )}
      </div>

      <div className="pt-remote-controls">
      {isSlideMode ? (
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => send("prevSlide")} style={{ flex: 1, padding: "13px 0", borderRadius: 14, background: "rgba(255,255,255,.1)", border: "none", color: "#fff", fontSize: 14, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
            <ChevronLeft size={18} /> 이전
          </button>
          <button onClick={() => send("nextSlide")} style={{ flex: 1, padding: "13px 0", borderRadius: 14, background: "#155855", border: "none", color: "#fff", fontSize: 14, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
            다음 <ChevronRight size={18} />
          </button>
        </div>
      ) : (
        <>
          <button
            className="pt-remote-play"
            onClick={() => send("toggle")}
            style={{ padding: "17px 0", borderRadius: 16, background: playing ? "#e85d2c" : "#155855", border: "none", color: "#fff", fontSize: 18, fontWeight: 900, display: "flex", alignItems: "center", justifyContent: "center", gap: 9 }}
          >
            {playing ? <><Pause size={24} /> 일시정지</> : <><Play size={24} /> 재생</>}
          </button>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => send("prevSlide")} style={{ flex: 1, padding: "11px 0", borderRadius: 14, background: "rgba(255,255,255,.1)", border: "none", color: "#fff", fontSize: 13, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
              <ChevronLeft size={16} /> 이전 문단
            </button>
            <button onClick={() => send("nextSlide")} style={{ flex: 1, padding: "11px 0", borderRadius: 14, background: "rgba(255,255,255,.1)", border: "none", color: "#fff", fontSize: 13, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
              다음 문단 <ChevronRight size={16} />
            </button>
          </div>
        </>
      )}

      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={() => send("restart")} style={{ flex: 1, padding: 14, borderRadius: 14, background: "rgba(255,255,255,.1)", border: "none", color: "#fff", fontSize: 14, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
          <RotateCcw size={18} /> 처음
        </button>
        <button onClick={() => { setFlipH((v) => !v); send("flipH"); }} style={{ flex: 1, padding: 14, borderRadius: 14, background: flipH ? "#e85d2c" : "rgba(255,255,255,.1)", border: "none", color: "#fff", fontSize: 14, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
          <FlipHorizontal size={18} /> 좌우
        </button>
        <button onClick={() => { setFlipV((v) => !v); send("flipV"); }} style={{ flex: 1, padding: 14, borderRadius: 14, background: flipV ? "#e85d2c" : "rgba(255,255,255,.1)", border: "none", color: "#fff", fontSize: 14, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
          <FlipVertical size={18} /> 상하
        </button>
      </div>

      {!isSlideMode && (
        <>
          <div style={{ display: "flex", gap: 7 }}>
            <button
              onClick={() => { const next = !guideEnabled; setGuideEnabled(next); send("guideEnabled", next); }}
              style={{ flex: 1, padding: 10, borderRadius: 11, background: guideEnabled ? "#e85d2c" : "rgba(255,255,255,.1)", border: "none", color: "#fff", fontSize: 12, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}
            >
              <Scan size={16} /> 가이드라인
            </button>
            <button
              onClick={() => { const next = !guideHighlight; setGuideHighlight(next); send("guideHighlight", next); }}
              disabled={!guideEnabled}
              style={{ flex: 1, padding: 10, borderRadius: 11, background: guideHighlight ? "#e85d2c" : "rgba(255,255,255,.1)", opacity: guideEnabled ? 1 : .45, border: "none", color: "#fff", fontSize: 12, fontWeight: 800 }}
            >
              문단 강조
            </button>
          </div>
          {guideEnabled && (
            <div className="pt-remote-slider-row">
              <label><Scan size={13} /> 가이드 위치</label>
              <input
                type="range" min={5} max={90} step={1} value={guidePosition}
                onChange={(e) => { const v = Number(e.target.value); setGuidePosition(v); send("guidePosition", v); }}
                style={orangeRange}
              />
            </div>
          )}
          <div className="pt-remote-slider-row">
            <label><Gauge size={13} /> 속도 {levelOf(speed, SPEED_LEVELS)}/10</label>
            <input
              type="range" min={1} max={10} step={1} value={levelOf(speed, SPEED_LEVELS)}
              onChange={(e) => { const v = SPEED_LEVELS[Number(e.target.value) - 1]; setSpeed(v); send("speed", v); }}
              style={orangeRange}
            />
          </div>
          <div className="pt-remote-slider-row">
            <label><AlignVerticalSpaceAround size={13} /> 문단 {levelOf(paragraphSpacing, PARAGRAPH_SPACING_LEVELS)}/10</label>
            <input
              type="range" min={1} max={10} step={1} value={levelOf(paragraphSpacing, PARAGRAPH_SPACING_LEVELS)}
              onChange={(e) => { const v = PARAGRAPH_SPACING_LEVELS[Number(e.target.value) - 1]; setParagraphSpacing(v); send("paragraphSpacing", v); }}
              style={orangeRange}
            />
          </div>
          <div className="pt-remote-slider-row">
            <label><AlignVerticalDistributeCenter size={13} /> 줄간격</label>
            <input
              type="range" min={1.2} max={2.4} step={0.1} value={lineHeight}
              onChange={(e) => { const v = Number(e.target.value); setLineHeight(v); send("lineHeight", v); }}
              style={orangeRange}
            />
          </div>
        </>
      )}

      <div className="pt-remote-slider-row">
        <label><Type size={13} /> 크기 {levelOf(fontSize, FONT_SIZE_LEVELS)}/10</label>
        <input
          type="range" min={1} max={10} step={1} value={levelOf(fontSize, FONT_SIZE_LEVELS)}
          onChange={(e) => { const v = FONT_SIZE_LEVELS[Number(e.target.value) - 1]; setFontSize(v); send("fontSize", v); }}
          style={orangeRange}
        />
      </div>

      <div style={{ display: "flex", gap: 5 }}>
        {(["left", "center", "right"] as const).map((v) => (
          <button key={v} onClick={() => { setHAlign(v); send("hAlign", v); }}
            style={{ flex: 1, padding: 7, borderRadius: 9, background: hAlign === v ? "#e85d2c" : "rgba(255,255,255,.1)", border: "none", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center" }}>
            {v === "left" ? <AlignLeft size={13} /> : v === "center" ? <AlignCenter size={13} /> : <AlignRight size={13} />}
          </button>
        ))}
        {(["top", "center", "bottom"] as const).map((v) => (
          <button key={v} onClick={() => { setVAlign(v); send("vAlign", v); }}
            style={{ flex: 1, padding: 7, borderRadius: 9, background: vAlign === v ? "#e85d2c" : "rgba(255,255,255,.1)", border: "none", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center" }}>
            {v === "top" ? <AlignVerticalJustifyStart size={13} /> : v === "center" ? <AlignVerticalJustifyCenter size={13} /> : <AlignVerticalJustifyEnd size={13} />}
          </button>
        ))}
      </div>

      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <div style={{ display: "flex", gap: 5 }}>
          {COLOR_OPTIONS.map((c) => (
            <button key={c} onClick={() => { setFontColor(c); send("fontColor", c); }}
              style={{ width: 22, height: 22, borderRadius: 6, background: c, border: fontColor === c ? "2px solid #e85d2c" : "1.5px solid rgba(255,255,255,.3)", flexShrink: 0 }} />
          ))}
        </div>
        <select value={fontFamily} onChange={(e) => { setFontFamily(e.target.value); send("fontFamily", e.target.value); }}
          style={{ flex: 1, minWidth: 0, padding: 7, borderRadius: 9, background: "rgba(255,255,255,.1)", border: "1px solid rgba(255,255,255,.2)", color: "#fff", fontSize: 12 }}>
          {FONT_OPTIONS.map((f) => <option key={f.value} value={f.value} style={{ color: "#000" }}>{f.label}</option>)}
        </select>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <Palette size={14} style={{ flexShrink: 0, color: "#9BB5B0" }} />
        <span style={{ fontSize: 11.5, fontWeight: 700, color: "#9BB5B0", flexShrink: 0 }}>배경</span>
        <div style={{ display: "flex", gap: 5, overflowX: "auto" }}>
          {BG_COLOR_OPTIONS.map((c) => (
            <button key={c} aria-label={`배경색 ${c}`} onClick={() => { setBgColor(c); send("bgColor", c); }}
              style={{ width: 25, height: 25, borderRadius: 7, background: c, border: bgColor === c ? "2px solid #e85d2c" : "1.5px solid rgba(255,255,255,.3)", flexShrink: 0 }} />
          ))}
        </div>
      </div>

      <div style={{ borderTop: "1px solid rgba(255,255,255,.12)", paddingTop: 7 }}>
        {!recording ? (
          <button onClick={startRecording} style={{ width: "100%", padding: 9, borderRadius: 12, background: "rgba(255,92,92,.15)", border: "1px solid rgba(255,92,92,.4)", color: "#ff8080", fontSize: 12, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
            <Mic size={14} /> 보조 음성 녹음 시작
          </button>
        ) : (
          <button onClick={stopRecording} style={{ width: "100%", padding: 9, borderRadius: 12, background: "#e85d2c", border: "none", color: "#fff", fontSize: 12, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
            <Square size={14} /> 녹음 종료
          </button>
        )}
        {recordedUrl && (
          <div style={{ marginTop: 8 }}>
            <audio src={recordedUrl} controls style={{ width: "100%", height: 32 }} />
            <a href={recordedUrl} download={`prompter-audio-${Date.now()}.webm`}
              style={{ display: "block", textAlign: "center", marginTop: 6, padding: 8, borderRadius: 9, background: "#155855", color: "#fff", fontWeight: 700, textDecoration: "none", fontSize: 12 }}>
              다운로드
            </a>
          </div>
        )}
      </div>
      </div>
    </main>
  );
}
