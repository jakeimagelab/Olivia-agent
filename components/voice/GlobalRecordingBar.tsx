"use client";

import { Check, Mic, Pause, Play, RotateCcw, Square, UploadCloud, Volume2, X } from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useRef, type CSSProperties } from "react";
import { canStartNewRecording, shouldShowRecordingBar } from "@/lib/voice/recordingBarVisibility";
import { useVoiceSession } from "./VoiceSessionProvider";
import styles from "./GlobalRecordingBar.module.css";

function formatElapsed(milliseconds: number) {
  const total = Math.max(0, Math.floor(milliseconds / 1_000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export default function GlobalRecordingBar({ surface, dockVisible = true, bottomOffset, showWhenIdle = true, onOpenRecording }: {
  surface: "mobile" | "tablet" | "desktop";
  dockVisible?: boolean;
  bottomOffset?: number;
  /** 음성기록 화면 밖에서는 실제 녹음/저장 작업 중인 경우만 표시한다. */
  showWhenIdle?: boolean;
  onOpenRecording?: () => void;
}) {
  const { state, importAudioFile, start, pause, resume, stop, retryStorage, dismissResult } = useVoiceSession();
  const barRef = useRef<HTMLElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const visible = shouldShowRecordingBar({
    kind: state.kind,
    capture: state.capture,
    storage: state.storage,
    isVoiceScreen: showWhenIdle,
  });
  const status = useMemo(() => {
    if (state.capture === "starting") return "인터뷰 진행 준비 중…";
    if (state.capture === "tracking") return "인터뷰 진행 중";
    if (state.capture === "recording") return "기존 녹음 세션 처리 중";
    if (state.capture === "paused") return "인터뷰 진행 일시정지";
    if (state.capture === "interrupted") return "진행 중단 · 확인 필요";
    if (state.capture === "stopping") return "인터뷰 진행 종료 중";
    if (state.storage === "awaiting_upload") return "아이폰 원본 파일 추가";
    if (state.capture === "stopped" && ["local", "uploading"].includes(state.storage)) return "원본 업로드 중";
    if (state.storage === "partial" || state.storage === "failed") return "기기 저장 완료 · 업로드 대기";
    if (state.storage === "stored") return "녹음 저장 완료";
    if (state.kind === "interview" && !state.target) return "인터뷰를 선택해주세요";
    return state.kind === "interview" ? "인터뷰 진행 준비" : "아이폰 음성 메모 가져오기";
  }, [state.capture, state.kind, state.storage, state.target]);

  useLayoutEffect(() => {
    if (!visible || !barRef.current) return;
    const setHeight = () => document.documentElement.style.setProperty("--olivia-global-recording-bar-height", `${barRef.current?.offsetHeight ?? 0}px`);
    setHeight();
    const observer = new ResizeObserver(setHeight);
    observer.observe(barRef.current);
    return () => {
      observer.disconnect();
      document.documentElement.style.setProperty("--olivia-global-recording-bar-height", "0px");
    };
  }, [status, state.notice, state.target?.questions.length, visible]);
  useEffect(() => () => document.documentElement.style.setProperty("--olivia-global-recording-bar-height", "0px"), []);

  if (!visible) return null;
  const tracking = state.capture === "tracking";
  const paused = state.capture === "paused";
  const canEnd = tracking || paused || state.capture === "interrupted";
  const canStart = canStartNewRecording(state.kind, state.capture);
  const pendingStorage = state.storage === "partial" || state.storage === "failed";
  const canImportGeneral = state.kind === "general" && ["idle", "stopped", "error"].includes(state.capture) && !["uploading", "local"].includes(state.storage);
  const canImportInterview = state.kind === "interview" && state.capture === "stopped" && state.storage === "awaiting_upload";
  const questionNumber = state.target?.questions.findIndex((question) => question.id === state.activeQuestionId);
  const chooseFile = () => fileInputRef.current?.click();

  return (
    <section
      ref={barRef}
      className={`${styles.bar} ${styles[surface]} ${dockVisible ? styles.aboveDock : styles.withoutDock}`}
      style={{ "--global-recording-offset": `${bottomOffset ?? 0}px` } as CSSProperties}
      data-global-recording-bar
      aria-label="현재 음성 처리 상태"
    >
      <input
        ref={fileInputRef}
        type="file"
        accept="audio/mp4,audio/m4a,audio/x-m4a,audio/mpeg,audio/mp3,audio/wav,audio/x-wav,audio/webm,audio/aac,.m4a,.mp3,.wav,.webm,.aac"
        hidden
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          event.currentTarget.value = "";
          if (file) void importAudioFile(file);
        }}
      />
      <div className={styles.summary}>
        <span className={`${styles.statusDot} ${tracking ? styles.live : ""}`} aria-hidden="true"><Mic size={16} /></span>
        <div>
          <strong>{status}{tracking || paused ? ` ${formatElapsed(state.elapsedMilliseconds)}` : ""}</strong>
          {state.kind === "interview" && state.target ? <small>{state.target.hospitalName} · {state.target.intervieweeName}{questionNumber !== undefined && questionNumber >= 0 ? ` · 질문 ${questionNumber + 1} / ${state.target.questions.length}` : ""}</small> : null}
          {!state.target && state.notice ? <small>{state.notice}</small> : null}
        </div>
      </div>
      <div className={styles.actions}>
        {(tracking || paused || state.capture === "interrupted") ? <button type="button" onClick={onOpenRecording} className={styles.quiet}>인터뷰 화면으로</button> : null}
        {tracking ? <button type="button" onClick={pause} aria-label="인터뷰 진행 일시정지"><Pause size={18} />일시정지</button> : null}
        {paused ? <button type="button" onClick={resume} aria-label="인터뷰 진행 계속"><Play size={18} />계속</button> : null}
        {canEnd ? <button type="button" className={styles.stop} onClick={() => { if (window.confirm("인터뷰 진행을 마치고 아이폰 원본을 추가할까요?")) void stop(); }} aria-label="인터뷰 진행 종료"><Square size={16} />인터뷰 마침</button> : null}
        {canImportGeneral || canImportInterview ? <button type="button" className={styles.start} onClick={chooseFile}><UploadCloud size={18} />{canImportInterview ? "원본 파일 추가" : "아이폰 파일 선택"}</button> : null}
        {state.kind === "interview" && state.capture === "idle" && canStart ? <button type="button" className={styles.start} onClick={() => void start()}><Mic size={18} />인터뷰 진행 시작</button> : null}
        {state.capture === "interrupted" ? <button type="button" onClick={() => void retryStorage()}><RotateCcw size={17} />확인/업로드</button> : null}
        {pendingStorage ? <button type="button" onClick={() => void retryStorage()}><UploadCloud size={17} />다시 시도</button> : null}
        {state.storage === "stored" ? <button type="button" onClick={onOpenRecording}><Volume2 size={17} />음성기록 보기</button> : null}
        {state.storage === "stored" && !tracking && !paused ? <button type="button" className={styles.dismiss} onClick={dismissResult} aria-label="저장 완료 알림 닫기"><X size={18} /></button> : null}
      </div>
      {state.notice && state.target ? <p className={styles.notice}>{state.notice}</p> : null}
      {state.error ? <p className={styles.error}>{state.error}</p> : null}
      {state.storage === "stored" && state.analysis !== "completed" ? <span className={styles.analysis}>{state.analysis === "failed" ? "AI 분석 실패 · 아이폰 원본은 안전하게 저장됨" : "AI 정리 중"}</span> : null}
      {state.storage === "stored" && state.analysis === "completed" ? <span className={styles.analysis}><Check size={14} />AI 정리 완료</span> : null}
    </section>
  );
}
