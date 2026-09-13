"use client";

import Link from "next/link";
import { AlertCircle, Check, Mic, Pause, Play, RotateCcw, ShieldCheck, Square } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { getSupabase } from "@/lib/supabase";
import { OliviaBrowserRecorder } from "@/lib/voice/browserRecorder";
import { baseAudioMimeType, VOICE_RECORDINGS_BUCKET, VOICE_UPLOAD_STORAGE_PREFIX } from "@/lib/voice/config";
import type { SpeakerHint, VoiceStatus } from "@/lib/voice/types";
import styles from "./OliviaRecorder.module.css";

type Stage = "idle" | "starting" | "recording" | "paused" | "uploading" | "processing" | "complete" | "error";
type RetryMode = "upload" | "process" | null;

type PendingVoiceUpload = {
  id: string;
  path: string;
  token: string;
  mimeType: string;
  createdAt: string;
  uploaded?: boolean;
  interruptedAt?: string;
};

type WakeLockSentinelLike = { release: () => Promise<void>; released?: boolean };

function formatTime(seconds: number) {
  const hours = Math.floor(seconds / 3_600);
  const minutes = Math.floor((seconds % 3_600) / 60);
  const remaining = seconds % 60;
  const values = hours > 0 ? [hours, minutes, remaining] : [minutes, remaining];
  return values.map((value) => String(value).padStart(2, "0")).join(":");
}

export function detectVoiceDevice(navigatorLike: Pick<Navigator, "userAgent" | "maxTouchPoints"> = navigator) {
  const ua = navigatorLike.userAgent;
  if (/iPhone/i.test(ua)) return "iphone";
  if (/iPad/i.test(ua) || (/Macintosh/i.test(ua) && navigatorLike.maxTouchPoints > 1)) return "ipad";
  if (/Android/i.test(ua)) return /Mobile/i.test(ua) ? "android-mobile" : "android-tablet";
  return "desktop";
}

async function readError(response: Response, fallback: string) {
  try {
    const body = await response.json() as { error?: unknown };
    return typeof body.error === "string" ? body.error : fallback;
  } catch {
    return fallback;
  }
}

export default function OliviaRecorder({
  embedded = false,
  mobileShell = false,
  onOpenResult,
}: {
  embedded?: boolean;
  mobileShell?: boolean;
  onOpenResult?: (id: string) => void;
}) {
  const engineRef = useRef<OliviaBrowserRecorder | null>(null);
  const timerRef = useRef<number | null>(null);
  const pollingRef = useRef<number | null>(null);
  const pollingStartedAtRef = useRef(0);
  const activeStartedAtRef = useRef<number | null>(null);
  const accumulatedMsRef = useRef(0);
  const recordedBlobRef = useRef<Blob | null>(null);
  const pendingUploadRef = useRef<PendingVoiceUpload | null>(null);
  const uploadedRef = useRef(false);
  const hintsRef = useRef<SpeakerHint[]>([]);
  const wakeLockRef = useRef<WakeLockSentinelLike | null>(null);
  const stageRef = useRef<Stage>("idle");

  const [stage, setStageState] = useState<Stage>("idle");
  const [elapsed, setElapsed] = useState(0);
  const [waveform, setWaveform] = useState<number[]>(() => Array(48).fill(0.08));
  const [speakerHint, setSpeakerHint] = useState("화자를 듣고 있어요");
  const [confidence, setConfidence] = useState(0);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [finalStatus, setFinalStatus] = useState<VoiceStatus | null>(null);
  const [notice, setNotice] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [retryMode, setRetryMode] = useState<RetryMode>(null);
  const [staleSession, setStaleSession] = useState<PendingVoiceUpload | null>(null);

  const setStage = useCallback((next: Stage) => {
    stageRef.current = next;
    setStageState(next);
  }, []);

  const getElapsedSeconds = useCallback(() => {
    const activeMs = activeStartedAtRef.current === null ? 0 : performance.now() - activeStartedAtRef.current;
    return Math.max(0, Math.floor((accumulatedMsRef.current + activeMs) / 1_000));
  }, []);

  const stopTimer = useCallback((commitActive: boolean) => {
    if (commitActive && activeStartedAtRef.current !== null) {
      accumulatedMsRef.current += performance.now() - activeStartedAtRef.current;
    }
    activeStartedAtRef.current = null;
    if (timerRef.current !== null) window.clearInterval(timerRef.current);
    timerRef.current = null;
    setElapsed(Math.floor(accumulatedMsRef.current / 1_000));
  }, []);

  const startTimer = useCallback(() => {
    activeStartedAtRef.current = performance.now();
    if (timerRef.current !== null) window.clearInterval(timerRef.current);
    timerRef.current = window.setInterval(() => setElapsed(getElapsedSeconds()), 250);
  }, [getElapsedSeconds]);

  const releaseWakeLock = useCallback(async () => {
    const lock = wakeLockRef.current;
    wakeLockRef.current = null;
    if (lock && !lock.released) {
      try { await lock.release(); } catch { /* 브라우저가 먼저 해제한 경우 */ }
    }
  }, []);

  const requestWakeLock = useCallback(async () => {
    if (document.visibilityState !== "visible" || !["recording", "paused"].includes(stageRef.current)) return;
    const wakeLock = (navigator as Navigator & {
      wakeLock?: { request: (type: "screen") => Promise<WakeLockSentinelLike> };
    }).wakeLock;
    if (!wakeLock || (wakeLockRef.current && !wakeLockRef.current.released)) return;
    try { wakeLockRef.current = await wakeLock.request("screen"); } catch { /* 미지원/권한 거절은 녹음을 막지 않는다 */ }
  }, []);

  const persistPending = useCallback((pending: PendingVoiceUpload) => {
    pendingUploadRef.current = pending;
    try { localStorage.setItem(`${VOICE_UPLOAD_STORAGE_PREFIX}${pending.id}`, JSON.stringify(pending)); } catch { /* 저장공간 제한 */ }
  }, []);

  const clearPending = useCallback((id: string) => {
    pendingUploadRef.current = null;
    try { localStorage.removeItem(`${VOICE_UPLOAD_STORAGE_PREFIX}${id}`); } catch { /* ignore */ }
  }, []);

  const patchSession = useCallback(async (id: string, body: Record<string, unknown>) => {
    const response = await fetch(`/api/voice/sessions/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!response.ok) throw new Error(await readError(response, "녹음 상태 저장 실패"));
  }, []);

  const finishFromStatus = useCallback((status: VoiceStatus) => {
    if (pollingRef.current !== null) window.clearInterval(pollingRef.current);
    pollingRef.current = null;
    setFinalStatus(status);
    setStage("complete");
  }, [setStage]);

  const pollRecording = useCallback(async (id: string) => {
    try {
      const response = await fetch(`/api/voice/sessions/${id}`, { cache: "no-store" });
      if (!response.ok) return;
      const data = await response.json() as { status?: VoiceStatus; error_message?: string | null };
      if (data.status === "completed" || data.status === "transcribed") {
        finishFromStatus(data.status);
      } else if (data.status === "error") {
        if (pollingRef.current !== null) window.clearInterval(pollingRef.current);
        pollingRef.current = null;
        setErrorMessage(data.error_message || "음성 처리 중 문제가 발생했습니다.");
        setRetryMode("process");
        setStage("error");
      } else if (Date.now() - pollingStartedAtRef.current > 15 * 60 * 1_000) {
        if (pollingRef.current !== null) window.clearInterval(pollingRef.current);
        pollingRef.current = null;
        setErrorMessage("분석이 예상보다 오래 걸리고 있습니다. 원본은 저장되어 있으니 잠시 뒤 다시 확인해주세요.");
        setRetryMode("process");
        setStage("error");
      }
    } catch {
      setNotice("네트워크 연결을 확인하고 있어요. 원본 업로드가 끝났다면 기록은 안전하게 보존됩니다.");
    }
  }, [finishFromStatus, setStage]);

  const beginPolling = useCallback((id: string) => {
    if (pollingRef.current !== null) window.clearInterval(pollingRef.current);
    pollingStartedAtRef.current = Date.now();
    void pollRecording(id);
    pollingRef.current = window.setInterval(() => void pollRecording(id), 1_800);
  }, [pollRecording]);

  const requestProcessing = useCallback(async (id: string) => {
    setStage("processing");
    setErrorMessage("");
    setRetryMode(null);
    beginPolling(id);
    try {
      const response = await fetch(`/api/voice/sessions/${id}/process`, { method: "POST" });
      if (!response.ok && response.status !== 409) {
        throw new Error(await readError(response, "음성 분석을 시작하지 못했습니다."));
      }
      await pollRecording(id);
    } catch (error) {
      if (pollingRef.current !== null) window.clearInterval(pollingRef.current);
      pollingRef.current = null;
      setErrorMessage(error instanceof Error ? error.message : "음성 분석을 시작하지 못했습니다.");
      setRetryMode("process");
      setStage("error");
    }
  }, [beginPolling, pollRecording, setStage]);

  const completeUpload = useCallback(async (pending: PendingVoiceUpload) => {
    await patchSession(pending.id, {
      status: "uploaded",
      durationSeconds: Math.max(elapsed, getElapsedSeconds()),
      liveSpeakerHints: hintsRef.current,
      mimeType: pending.mimeType,
    });
    clearPending(pending.id);
    await requestProcessing(pending.id);
  }, [clearPending, elapsed, getElapsedSeconds, patchSession, requestProcessing]);

  const uploadRecording = useCallback(async (blob: Blob, pending: PendingVoiceUpload) => {
    setStage("uploading");
    setErrorMessage("");
    setRetryMode(null);
    try {
      await patchSession(pending.id, {
        status: "uploading",
        durationSeconds: Math.max(elapsed, getElapsedSeconds()),
        liveSpeakerHints: hintsRef.current,
        mimeType: pending.mimeType,
      });
      const upload = await getSupabase().storage.from(VOICE_RECORDINGS_BUCKET).uploadToSignedUrl(
        pending.path,
        pending.token,
        blob,
        { contentType: baseAudioMimeType(blob.type || pending.mimeType) },
      );
      if (upload.error) throw upload.error;
      uploadedRef.current = true;
      persistPending({ ...pending, uploaded: true });
      await completeUpload({ ...pending, uploaded: true });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "녹음 업로드에 실패했습니다.");
      setRetryMode(uploadedRef.current ? "process" : "upload");
      setStage("error");
    }
  }, [completeUpload, elapsed, getElapsedSeconds, patchSession, persistPending, setStage]);

  const start = useCallback(async () => {
    setStage("starting");
    setErrorMessage("");
    setNotice("");
    setRetryMode(null);
    setFinalStatus(null);
    setWaveform(Array(48).fill(0.08));
    setSpeakerHint("화자를 듣고 있어요");
    setConfidence(0);
    hintsRef.current = [];
    accumulatedMsRef.current = 0;
    uploadedRef.current = false;
    recordedBlobRef.current = null;

    let engine: OliviaBrowserRecorder | null = null;
    try {
      engine = new OliviaBrowserRecorder({
        onWaveform: setWaveform,
        onStateWarning: setNotice,
        onSpeakerHint: (speaker, score) => {
          setSpeakerHint(speaker);
          setConfidence(score);
          const hint = { at: getElapsedSeconds(), speaker, confidence: score };
          const previous = hintsRef.current.at(-1);
          if (!previous || previous.speaker !== speaker || hint.at - previous.at >= 30) {
            hintsRef.current = [...hintsRef.current, hint].slice(-1_000);
          }
        },
      });
      await engine.start();
      engineRef.current = engine;
      startTimer();

      const response = await fetch("/api/voice/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mimeType: engine.mimeType, deviceType: detectVoiceDevice() }),
      });
      if (!response.ok) throw new Error(await readError(response, "녹음 세션 생성 실패"));
      const session = await response.json() as { id: string; path: string; uploadToken: string; mimeType: string };
      const pending: PendingVoiceUpload = {
        id: session.id,
        path: session.path,
        token: session.uploadToken,
        mimeType: session.mimeType,
        createdAt: new Date().toISOString(),
      };
      setSessionId(session.id);
      persistPending(pending);
      setStage("recording");
      void requestWakeLock();
    } catch (error) {
      stopTimer(true);
      if (engine?.state === "recording" || engine?.state === "paused") {
        try { await engine.stop(); } catch { /* cleanup best effort */ }
      }
      engineRef.current = null;
      const message = error instanceof DOMException && error.name === "NotAllowedError"
        ? "마이크 사용이 허용되지 않았습니다. Safari 또는 브라우저 설정에서 마이크 권한을 허용해주세요."
        : error instanceof Error ? error.message : "녹음을 시작하지 못했습니다.";
      setErrorMessage(message);
      setRetryMode(null);
      setStage("error");
    }
  }, [getElapsedSeconds, persistPending, requestWakeLock, setStage, startTimer, stopTimer]);

  const pause = useCallback(() => {
    engineRef.current?.pause();
    stopTimer(true);
    setStage("paused");
  }, [setStage, stopTimer]);

  const resume = useCallback(() => {
    engineRef.current?.resume();
    startTimer();
    setStage("recording");
    void requestWakeLock();
  }, [requestWakeLock, setStage, startTimer]);

  const stop = useCallback(async () => {
    const engine = engineRef.current;
    const pending = pendingUploadRef.current;
    if (!engine || !pending) return;
    stopTimer(true);
    setStage("uploading");
    await releaseWakeLock();
    try {
      const blob = await engine.stop();
      engineRef.current = null;
      recordedBlobRef.current = blob;
      await uploadRecording(blob, pending);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "녹음을 종료하지 못했습니다.");
      setRetryMode(recordedBlobRef.current ? "upload" : null);
      setStage("error");
    }
  }, [releaseWakeLock, setStage, stopTimer, uploadRecording]);

  const retry = useCallback(async () => {
    const id = sessionId;
    const pending = pendingUploadRef.current;
    if (!id) return;
    if (retryMode === "upload" && recordedBlobRef.current && pending) {
      await uploadRecording(recordedBlobRef.current, pending);
      return;
    }
    if (retryMode === "process") {
      try {
        if (pending?.uploaded) await completeUpload(pending);
        else await requestProcessing(id);
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : "다시 처리하지 못했습니다.");
        setStage("error");
      }
    }
  }, [completeUpload, requestProcessing, retryMode, sessionId, setStage, uploadRecording]);

  useEffect(() => {
    try {
      const pendingKeys = Object.keys(localStorage).filter((key) => key.startsWith(VOICE_UPLOAD_STORAGE_PREFIX));
      const values = pendingKeys.flatMap((key) => {
        try { return [JSON.parse(localStorage.getItem(key) || "") as PendingVoiceUpload]; } catch { return []; }
      });
      const recent = values.sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
      if (recent) setStaleSession(recent);
    } catch { /* localStorage unavailable */ }
  }, []);

  useEffect(() => {
    const onVisibilityChange = () => {
      if (!["recording", "paused"].includes(stageRef.current)) return;
      if (document.visibilityState === "hidden") {
        engineRef.current?.requestData();
        setNotice("화면을 벗어나면 iPhone Safari가 녹음을 중단할 수 있어요. Olivia를 다시 열어 상태를 확인해주세요.");
      } else {
        void requestWakeLock();
      }
    };
    const onPageHide = () => {
      if (!["recording", "paused"].includes(stageRef.current)) return;
      engineRef.current?.requestData();
      const pending = pendingUploadRef.current;
      if (pending) persistPending({ ...pending, interruptedAt: new Date().toISOString() });
    };
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!["recording", "paused"].includes(stageRef.current)) return;
      event.preventDefault();
      event.returnValue = "";
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("pagehide", onPageHide);
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("pagehide", onPageHide);
      window.removeEventListener("beforeunload", onBeforeUnload);
    };
  }, [persistPending, requestWakeLock]);

  useEffect(() => () => {
    if (timerRef.current !== null) window.clearInterval(timerRef.current);
    if (pollingRef.current !== null) window.clearInterval(pollingRef.current);
    const engine = engineRef.current;
    if (engine?.state === "recording" || engine?.state === "paused") {
      engine.requestData();
      const pending = pendingUploadRef.current;
      if (pending) {
        persistPending({ ...pending, interruptedAt: new Date().toISOString() });
      }
      // Tablet 앱 전환처럼 pagehide가 발생하지 않는 화면 이탈에서도
      // 마이크 트랙을 남기지 않는다. 생성된 Blob은 브라우저 수명 밖으로
      // 복구할 수 없으므로 완료되지 않은 세션 표시는 그대로 보존한다.
      void engine.stop().catch(() => undefined);
      engineRef.current = null;
    }
    void releaseWakeLock();
  }, [persistPending, releaseWakeLock]);

  const recordingActive = stage === "recording" || stage === "paused";

  if (mobileShell) {
    return (
      <main className={styles.mobileRecorder} data-voice-stage={stage}>
        <section className={styles.mobileRecorderContent} aria-live="polite">
          {stage === "idle" ? (
            <div className={styles.mobileIdle}>
              <div className={styles.mobileIntroCard}>
                <span className={styles.mobileIntroIcon}><Mic size={20} /></span>
                <span className={styles.mobileIntroCopy}>
                  <strong>새 음성 기록</strong>
                  <small>대화와 회의를 녹음하면 Olivia가 정리해요.</small>
                </span>
                <span className={styles.mobilePrivateBadge}><ShieldCheck size={13} /> 비공개</span>
              </div>

              {staleSession ? (
                <div className={styles.mobileRecoveryNotice}>
                  <AlertCircle size={17} />
                  <span><strong>완료되지 않은 이전 녹음이 있어요.</strong><small>브라우저가 종료됐다면 오디오는 복구되지 않을 수 있어요.</small></span>
                  <button type="button" onClick={() => {
                    clearPending(staleSession.id);
                    setStaleSession(null);
                  }}>확인</button>
                </div>
              ) : null}

              <div className={styles.mobileReadyCard}>
                <span className={styles.mobileReadyPill}>녹음 준비됨</span>
                <div className={styles.mobileIdleWaveform} aria-hidden="true">
                  {[18, 31, 47, 26, 58, 38, 72, 45, 28, 62, 82, 52, 34, 68, 43, 76, 55, 35, 60, 29, 48, 24, 37, 19].map((height, index) => (
                    <i key={index} style={{ height: `${height}%` }} />
                  ))}
                </div>
                <h2>지금 대화를 기록해보세요</h2>
                <p>녹음을 마치면 화자를 구분하고<br />핵심 내용과 할 일을 정리합니다.</p>
              </div>

              <div className={styles.mobileFeatureRow} aria-label="음성 기록 저장 항목">
                <span>원본 보존</span>
                <i />
                <span>화자 구분</span>
                <i />
                <span>AI 요약</span>
              </div>

              <button type="button" className={styles.mobileStartButton} onClick={() => void start()}>
                <span><Mic size={21} /></span>
                <strong>녹음 시작</strong>
                <small>마이크 권한을 확인합니다</small>
              </button>
              <p className={styles.mobileConsent}>상대방에게 녹음 사실을 알리고 동의를 받은 뒤 시작해주세요.</p>
            </div>
          ) : null}

          {stage === "starting" ? (
            <MobileProcessing icon="mic" title="마이크를 준비하고 있어요" detail="브라우저의 마이크 사용을 허용해주세요." />
          ) : null}

          {recordingActive ? (
            <div className={styles.mobileRecording}>
              <div className={styles.mobileRecordingTopline}>
                <span className={styles.mobileRecordingState}>
                  <i className={stage === "paused" ? styles.mobilePausedDot : styles.mobileLiveDot} />
                  {stage === "paused" ? "일시정지" : "녹음 중"}
                </span>
                <span className={styles.mobilePrivateBadge}><ShieldCheck size={13} /> 비공개 저장</span>
              </div>

              <time className={styles.mobileTimer}>{formatTime(elapsed)}</time>
              <p className={styles.mobileTimerCaption}>{stage === "paused" ? "녹음이 잠시 멈췄어요" : "대화를 안전하게 기록하고 있어요"}</p>

              <div className={styles.mobileWaveCard}>
                <div className={styles.mobileWaveform} aria-label="실시간 음성 파형">
                  {waveform.map((value, index) => (
                    <i key={index} style={{ height: `${Math.max(7, value * 100)}%` }} />
                  ))}
                </div>
              </div>

              <div className={styles.mobileSpeakerCard}>
                <span className={styles.mobileSpeakerAvatar}>{speakerHint.match(/\d+/)?.[0] || "…"}</span>
                <span>
                  <small>현재 화자 추정</small>
                  <strong>{speakerHint}</strong>
                </span>
                <em>{confidence > 0 ? `${Math.round(confidence * 100)}%` : "분석 중"}</em>
              </div>

              {notice ? <p className={styles.mobileNotice}><AlertCircle size={15} /> {notice}</p> : null}

              <div className={styles.mobileRecordingActions}>
                {stage === "recording" ? (
                  <button type="button" className={styles.mobilePauseButton} onClick={pause}><Pause size={19} /> 일시정지</button>
                ) : (
                  <button type="button" className={styles.mobilePauseButton} onClick={resume}><Play size={19} /> 계속 녹음</button>
                )}
                <button type="button" className={styles.mobileStopButton} onClick={() => void stop()}><Square size={17} fill="currentColor" /> 종료하고 저장</button>
              </div>
            </div>
          ) : null}

          {stage === "uploading" ? (
            <MobileProcessing title="녹음을 안전하게 저장하고 있어요" detail="원본 파일을 Olivia에 보관하고 있어요. 이 화면을 닫지 말아주세요." />
          ) : null}
          {stage === "processing" ? (
            <MobileProcessing title="대화 내용을 정리하고 있어요" detail="화자를 구분하고 핵심 내용과 할 일을 찾고 있어요." />
          ) : null}

          {stage === "complete" ? (
            <div className={styles.mobileResultState}>
              <span className={styles.mobileResultIcon}><Check size={29} /></span>
              <span className={styles.mobileResultEyebrow}>{finalStatus === "transcribed" ? "전사 저장 완료" : "정리 완료"}</span>
              <h2>{finalStatus === "transcribed" ? "대화 기록을 안전하게 저장했어요" : "음성 기록 정리가 끝났어요"}</h2>
              <p>{finalStatus === "transcribed" ? "전체 대화와 화자 정보는 보존됐어요. AI 요약은 나중에 다시 진행할 수 있어요." : "화자별 대화와 AI 요약, 발견된 할 일을 확인해보세요."}</p>
              {sessionId ? (
                onOpenResult ? (
                  <button type="button" className={styles.mobileResultButton} onClick={() => onOpenResult(sessionId)}>정리된 기록 보기</button>
                ) : <Link href={`/voice-recorder/${sessionId}`} className={styles.mobileResultButton}>정리된 기록 보기</Link>
              ) : null}
            </div>
          ) : null}

          {stage === "error" ? (
            <div className={styles.mobileResultState}>
              <span className={`${styles.mobileResultIcon} ${styles.mobileResultIconError}`}><AlertCircle size={29} /></span>
              <span className={styles.mobileResultEyebrow}>확인이 필요해요</span>
              <h2>{errorMessage || "음성 처리 중 문제가 발생했습니다."}</h2>
              <p>{uploadedRef.current || retryMode === "process" ? "업로드된 원본과 전사 결과는 그대로 보존되어 있어요." : "연결 상태와 마이크 권한을 확인해주세요."}</p>
              <div className={styles.mobileErrorActions}>
                {retryMode ? <button type="button" onClick={() => void retry()}><RotateCcw size={17} /> 다시 시도</button> : null}
                {sessionId && (uploadedRef.current || retryMode === "process") ? (
                  onOpenResult ? <button type="button" onClick={() => onOpenResult(sessionId)}>기록 확인</button> : <Link href={`/voice-recorder/${sessionId}`}>기록 확인</Link>
                ) : null}
                {!retryMode ? <button type="button" onClick={() => setStage("idle")}>처음으로</button> : null}
              </div>
            </div>
          ) : null}
        </section>
      </main>
    );
  }

  return (
    <main className={`${styles.root} ${embedded ? styles.embedded : ""}`} data-voice-stage={stage}>
      <section className={styles.card} aria-live="polite">
        {!embedded ? (
          <header className={styles.header}>
            <div>
              <span className={styles.logoMark}><Mic size={18} /></span>
              <div><small>OLIVIA</small><h1>음성 기록</h1></div>
            </div>
            <span className={styles.privateBadge}><ShieldCheck size={15} /> 비공개 저장</span>
          </header>
        ) : null}

        {stage === "idle" ? (
          <div className={styles.idle}>
            <div className={styles.idleCopy}>
              <p>MEETING MEMORY</p>
              <h2>대화를 녹음하면<br />Olivia가 화자별로 정리해요.</h2>
              <span>원본 음성, 전체 대화, AI 요약을 각각 안전하게 보존합니다.</span>
            </div>
            {staleSession ? (
              <div className={styles.recoveryNotice}>
                <AlertCircle size={18} />
                <span><strong>완료되지 않은 이전 세션이 있어요.</strong> 브라우저가 종료됐다면 오디오 자체는 복구되지 않을 수 있습니다.</span>
                <button type="button" onClick={() => {
                  clearPending(staleSession.id);
                  setStaleSession(null);
                }}>확인</button>
              </div>
            ) : null}
            <button type="button" className={styles.startButton} onClick={() => void start()}>
              <span><Mic size={36} /></span>
              <strong>녹음 시작</strong>
              <small>마이크 권한을 확인합니다</small>
            </button>
            <p className={styles.consentCopy}>상대방에게 녹음 사실을 알리고 동의를 받은 뒤 시작해주세요.</p>
          </div>
        ) : null}

        {stage === "starting" ? <Processing title="마이크를 준비하고 있어요." detail="브라우저의 마이크 사용을 허용해주세요." /> : null}

        {recordingActive ? (
          <div className={styles.recordingPanel}>
            <div className={styles.recordingState}>
              <span className={stage === "paused" ? styles.pausedDot : styles.liveDot} />
              {stage === "paused" ? "일시정지" : "녹음 중"}
            </div>
            <time className={styles.timer}>{formatTime(elapsed)}</time>
            <div className={styles.waveform} aria-label="실시간 음성 파형">
              {waveform.map((value, index) => (
                <i key={index} style={{ height: `${Math.max(7, value * 100)}%` }} />
              ))}
            </div>
            <div className={styles.speakerCard}>
              <small>현재 화자 추정</small>
              <strong>{speakerHint}</strong>
              <span>화면용 추정값 · {confidence > 0 ? `${Math.round(confidence * 100)}%` : "분석 중"}</span>
            </div>
            {notice ? <p className={styles.notice}><AlertCircle size={16} /> {notice}</p> : null}
            <div className={styles.controls}>
              {stage === "recording" ? (
                <button type="button" className={styles.secondaryControl} onClick={pause} aria-label="녹음 일시정지"><Pause /></button>
              ) : (
                <button type="button" className={styles.secondaryControl} onClick={resume} aria-label="녹음 계속하기"><Play /></button>
              )}
              <button type="button" className={styles.stopControl} onClick={() => void stop()} aria-label="녹음 종료"><Square size={24} fill="currentColor" /></button>
            </div>
            <div className={styles.controlLabels}><span>{stage === "recording" ? "일시정지" : "계속 녹음"}</span><span>종료하고 저장</span></div>
          </div>
        ) : null}

        {stage === "uploading" ? <Processing title="녹음을 안전하게 저장하고 있어요." detail="이 화면을 닫지 말아주세요." /> : null}
        {stage === "processing" ? <Processing title="화자를 구분하고 내용을 정리하고 있어요." detail="종료 후 과정은 Olivia가 자동으로 처리합니다." /> : null}

        {stage === "complete" ? (
          <div className={styles.completePanel}>
            <span className={styles.completeIcon}><Check size={38} /></span>
            <p>{finalStatus === "transcribed" ? "TRANSCRIPT SAVED" : "READY"}</p>
            <h2>{finalStatus === "transcribed" ? "전사 결과를 안전하게 저장했어요" : "정리가 완료됐어요"}</h2>
            <span>{finalStatus === "transcribed" ? "Hermes 요약은 현재 대기 중이며 기록 화면에서 다시 시도할 수 있어요." : "화자별 대화와 핵심 내용, 후속 할 일을 확인해보세요."}</span>
            {sessionId ? onOpenResult ? (
              <button type="button" className={styles.resultLink} onClick={() => onOpenResult(sessionId)}>기록 보기</button>
            ) : <Link href={`/voice-recorder/${sessionId}`} className={styles.resultLink}>기록 보기</Link> : null}
          </div>
        ) : null}

        {stage === "error" ? (
          <div className={styles.errorPanel}>
            <span className={styles.errorIcon}><AlertCircle size={34} /></span>
            <p>확인이 필요해요</p>
            <h2>{errorMessage || "음성 처리 중 문제가 발생했습니다."}</h2>
            {uploadedRef.current || retryMode === "process" ? <span>업로드된 원본과 전사 결과는 삭제하지 않았습니다.</span> : null}
            <div className={styles.errorActions}>
              {retryMode ? <button type="button" onClick={() => void retry()}><RotateCcw size={17} /> 다시 시도</button> : null}
              {sessionId && (uploadedRef.current || retryMode === "process") ? onOpenResult ? (
                <button type="button" onClick={() => onOpenResult(sessionId)}>기록 확인</button>
              ) : <Link href={`/voice-recorder/${sessionId}`}>기록 확인</Link> : null}
              {!retryMode ? <button type="button" onClick={() => setStage("idle")}>처음으로</button> : null}
            </div>
          </div>
        ) : null}
      </section>
    </main>
  );
}

function Processing({ title, detail }: { title: string; detail: string }) {
  return (
    <div className={styles.processing}>
      <span className={styles.spinner} />
      <p>OLIVIA IS WORKING</p>
      <h2>{title}</h2>
      <span>{detail}</span>
    </div>
  );
}

function MobileProcessing({
  title,
  detail,
  icon,
}: {
  title: string;
  detail: string;
  icon?: "mic";
}) {
  return (
    <div className={styles.mobileProcessing}>
      <span className={styles.mobileProcessingVisual}>
        {icon === "mic" ? <Mic size={25} /> : <span className={styles.mobileSpinner} />}
      </span>
      <span className={styles.mobileResultEyebrow}>OLIVIA</span>
      <h2>{title}</h2>
      <p>{detail}</p>
      <div className={styles.mobileProcessingSteps} aria-hidden="true">
        <i />
        <i />
        <i />
      </div>
    </div>
  );
}
