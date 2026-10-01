"use client";

import { Check, Mic, Pause, Play, RotateCcw, Square, UploadCloud, Volume2, X } from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useRef, type CSSProperties } from "react";
import { useVoiceSession } from "./VoiceSessionProvider";
import styles from "./GlobalRecordingBar.module.css";

function formatElapsed(milliseconds: number) {
  const total = Math.max(0, Math.floor(milliseconds / 1_000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export default function GlobalRecordingBar({ surface, dockVisible = true, bottomOffset, onOpenRecording }: {
  surface: "mobile" | "tablet" | "desktop";
  dockVisible?: boolean;
  bottomOffset?: number;
  onOpenRecording?: () => void;
}) {
  const { state, start, pause, resume, stop, retryStorage, dismissResult } = useVoiceSession();
  const barRef = useRef<HTMLElement>(null);
  const active = state.kind !== null;
  const status = useMemo(() => {
    if (state.capture === "starting") return "마이크 준비 중…";
    if (state.capture === "recording") return state.kind === "interview" ? "인터뷰 녹음 중" : "녹음 중";
    if (state.capture === "paused") return "일시정지";
    if (state.capture === "interrupted") return "녹음 중단 · 확인 필요";
    if (state.capture === "stopping") return "녹음 종료됨 · 저장 중";
    if (state.capture === "stopped" && ["local", "uploading"].includes(state.storage)) return "녹음 종료됨 · 저장 중";
    if (state.storage === "partial" || state.storage === "failed") return "기기 저장 완료 · 업로드 대기";
    if (state.storage === "stored") return "녹음 저장 완료";
    if (state.kind === "interview" && !state.target) return "인터뷰를 선택해주세요";
    return state.kind === "interview" ? "인터뷰 녹음 준비" : "새 음성기록";
  }, [state.capture, state.kind, state.storage, state.target]);

  useLayoutEffect(() => {
    if (!active || !barRef.current) return;
    const setHeight = () => document.documentElement.style.setProperty("--olivia-global-recording-bar-height", `${barRef.current?.offsetHeight ?? 0}px`);
    setHeight();
    const observer = new ResizeObserver(setHeight);
    observer.observe(barRef.current);
    return () => {
      observer.disconnect();
      document.documentElement.style.setProperty("--olivia-global-recording-bar-height", "0px");
    };
  }, [active, status, state.notice, state.target?.questions.length]);
  useEffect(() => () => document.documentElement.style.setProperty("--olivia-global-recording-bar-height", "0px"), []);

  if (!active) return null;
  const recording = state.capture === "recording";
  const paused = state.capture === "paused";
  const canEnd = recording || paused || state.capture === "interrupted";
  const pendingStorage = state.storage === "partial" || state.storage === "failed";
  const questionNumber = state.target?.questions.findIndex((question) => question.id === state.activeQuestionId);

  return (
    <section
      ref={barRef}
      className={`${styles.bar} ${styles[surface]} ${dockVisible ? styles.aboveDock : styles.withoutDock}`}
      style={{ "--global-recording-offset": `${bottomOffset ?? 0}px` } as CSSProperties}
      data-global-recording-bar
      aria-label="현재 녹음 상태"
    >
      <div className={styles.summary}>
        <span className={`${styles.statusDot} ${recording ? styles.live : ""}`} aria-hidden="true"><Mic size={16} /></span>
        <div>
          <strong>{status}{recording || paused ? ` ${formatElapsed(state.elapsedMilliseconds)}` : ""}</strong>
          {state.kind === "interview" && state.target ? <small>{state.target.hospitalName} · {state.target.intervieweeName}{questionNumber !== undefined && questionNumber >= 0 ? ` · 질문 ${questionNumber + 1} / ${state.target.questions.length}` : ""}</small> : null}
          {!state.target && state.notice ? <small>{state.notice}</small> : null}
        </div>
      </div>
      <div className={styles.actions}>
        {(recording || paused || state.capture === "interrupted") ? <button type="button" onClick={onOpenRecording} className={styles.quiet}>녹음 화면으로</button> : null}
        {recording ? <button type="button" onClick={pause} aria-label="녹음 일시정지"><Pause size={18} />일시정지</button> : null}
        {paused ? <button type="button" onClick={resume} aria-label="녹음 계속"><Play size={18} />계속</button> : null}
        {canEnd ? <button type="button" className={styles.stop} onClick={() => { if (window.confirm("녹음을 종료하고 저장할까요?")) void stop(); }} aria-label="녹음 종료"><Square size={16} />종료</button> : null}
        {state.capture === "idle" || state.capture === "error" ? <button type="button" className={styles.start} onClick={() => void start()} disabled={state.capture === "error" && !state.kind}><Mic size={18} />녹음 시작</button> : null}
        {state.capture === "interrupted" ? <button type="button" onClick={() => void retryStorage()}><RotateCcw size={17} />확인/업로드</button> : null}
        {pendingStorage ? <button type="button" onClick={() => void retryStorage()}><UploadCloud size={17} />다시 시도</button> : null}
        {state.storage === "stored" ? <button type="button" onClick={onOpenRecording}><Volume2 size={17} />음성기록 보기</button> : null}
        {state.storage === "stored" && !recording && !paused ? <button type="button" className={styles.dismiss} onClick={dismissResult} aria-label="저장 완료 알림 닫기"><X size={18} /></button> : null}
      </div>
      {state.notice && state.target ? <p className={styles.notice}>{state.notice}</p> : null}
      {state.error ? <p className={styles.error}>{state.error}</p> : null}
      {state.storage === "stored" && state.analysis !== "completed" ? <span className={styles.analysis}>{state.analysis === "failed" ? "AI 정리 실패 · 원본은 안전하게 저장됨" : "AI 정리 중"}</span> : null}
      {state.storage === "stored" && state.analysis === "completed" ? <span className={styles.analysis}><Check size={14} />AI 정리 완료</span> : null}
    </section>
  );
}
