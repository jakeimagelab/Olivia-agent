"use client";

import { AlertCircle, ArrowLeft, Check, ChevronLeft, ChevronRight, FileText, MessageSquarePlus, Mic, Pause, Play, Square, Star } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getSupabase } from "@/lib/supabase";
import { OliviaSegmentedBrowserRecorder } from "@/lib/voice/segmentedBrowserRecorder";
import { baseAudioMimeType, VOICE_RECORDINGS_BUCKET } from "@/lib/voice/config";
import { interviewRecoveryStorageKey, nextMissingChunkSequence, normalizeInterviewRecoveryState } from "@/lib/voice/interview/recovery";
import type { InterviewPreparation, InterviewQuestionSnapshot, InterviewRecoveryState } from "@/lib/voice/interview/types";
import { detectOliviaDevice } from "@/lib/device/detectDevice";
import styles from "./OliviaInterviewRecorder.module.css";

type Stage = "idle" | "starting" | "recording" | "paused" | "finishing" | "complete" | "error";
type WakeLockSentinelLike = { release: () => Promise<void>; released?: boolean };
type PendingSegment = {
  segment: { blob: Blob; mimeType: string };
  sequence: number;
  startSeconds: number;
  endSeconds: number;
};
const CHUNK_MS = 4 * 60 * 1_000;

function formatTime(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  return `${String(minutes).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

function errorFrom(response: Response, fallback: string) {
  return response.json().then((body: { error?: unknown }) => typeof body.error === "string" ? body.error : fallback).catch(() => fallback);
}

function newEventId() { return crypto.randomUUID(); }

export default function OliviaInterviewRecorder({ preparation, recovery, onClose, onComplete }: {
  preparation: InterviewPreparation;
  recovery?: InterviewRecoveryState | null;
  onClose: () => void;
  onComplete?: (recordingId: string) => void;
}) {
  const engineRef = useRef<OliviaSegmentedBrowserRecorder | null>(null);
  const timerRef = useRef<number | null>(null);
  const rotationRef = useRef<number | null>(null);
  const startedAtRef = useRef<number | null>(null);
  const elapsedFrozenRef = useRef(0);
  const currentChunkStartedAtRef = useRef(0);
  const nextSequenceRef = useRef(0);
  const pendingUploadsRef = useRef<Promise<void>[]>([]);
  const failedSegmentsRef = useRef<Map<number, PendingSegment>>(new Map());
  const finalDurationRef = useRef<number | null>(null);
  const wakeLockRef = useRef<WakeLockSentinelLike | null>(null);
  const recordingIdRef = useRef<string | null>(null);
  const stageRef = useRef<Stage>("idle");
  const [stage, setStageState] = useState<Stage>("idle");
  const [elapsed, setElapsed] = useState(0);
  const [waveform, setWaveform] = useState<number[]>(() => Array(48).fill(.08));
  const [questionIndex, setQuestionIndex] = useState(0);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [recordingId, setRecordingId] = useState<string | null>(null);
  const [markers, setMarkers] = useState<InterviewRecoveryState["questionMarkers"]>([]);
  const [highlights, setHighlights] = useState<InterviewRecoveryState["highlightMarkers"]>([]);
  const [notes, setNotes] = useState<InterviewRecoveryState["fieldNotes"]>([]);
  const [followUps, setFollowUps] = useState<InterviewRecoveryState["followUps"]>([]);
  const questions = useMemo(
    () => preparation.current_version_id ? preparation.selected_questions : [],
    [preparation.current_version_id, preparation.selected_questions],
  );
  const question = questions[questionIndex];

  const setStage = useCallback((next: Stage) => { stageRef.current = next; setStageState(next); }, []);
  const elapsedSeconds = useCallback(() => {
    const active = startedAtRef.current === null ? 0 : Math.max(0, performance.now() - startedAtRef.current);
    return Math.floor((elapsedFrozenRef.current + active) / 1_000);
  }, []);
  const clearTimers = useCallback(() => {
    if (timerRef.current !== null) window.clearInterval(timerRef.current);
    if (rotationRef.current !== null) window.clearInterval(rotationRef.current);
    timerRef.current = null; rotationRef.current = null;
  }, []);
  const persistRecovery = useCallback((overrides: Partial<InterviewRecoveryState> = {}) => {
    const id = recordingIdRef.current;
    if (!id || !preparation.current_version_id) return;
    const state: InterviewRecoveryState = {
      version: 1, preparationId: preparation.id, versionId: preparation.current_version_id, recordingId: id, mode: "interview",
      currentChunk: nextSequenceRef.current,
      uploadedSequences: overrides.uploadedSequences ?? [],
      selectedQuestions: questions,
      questionMarkers: overrides.questionMarkers ?? markers,
      highlightMarkers: overrides.highlightMarkers ?? highlights,
      fieldNotes: overrides.fieldNotes ?? notes,
      followUps: overrides.followUps ?? followUps,
      updatedAt: new Date().toISOString(),
    };
    try {
      const existing = normalizeInterviewRecoveryState(JSON.parse(localStorage.getItem(interviewRecoveryStorageKey(id)) || "null"));
      state.uploadedSequences = overrides.uploadedSequences ?? existing?.uploadedSequences ?? state.uploadedSequences;
      localStorage.setItem(interviewRecoveryStorageKey(id), JSON.stringify(state));
    } catch (storageError) { console.warn("[voice/interview/recovery]", storageError); }
  }, [followUps, highlights, markers, notes, preparation.current_version_id, preparation.id, questions]);
  const persistRecoveryRef = useRef(persistRecovery);
  useEffect(() => { persistRecoveryRef.current = persistRecovery; }, [persistRecovery]);
  const releaseWakeLock = useCallback(async () => {
    const lock = wakeLockRef.current; wakeLockRef.current = null;
    if (lock && !lock.released) try { await lock.release(); } catch (lockError) { console.warn("[voice/interview/wake-lock]", lockError); }
  }, []);
  const requestWakeLock = useCallback(async () => {
    if (document.visibilityState !== "visible" || !["recording", "paused"].includes(stageRef.current)) return;
    const wakeLock = (navigator as Navigator & { wakeLock?: { request: (type: "screen") => Promise<WakeLockSentinelLike> } }).wakeLock;
    if (!wakeLock || (wakeLockRef.current && !wakeLockRef.current.released)) return;
    try { wakeLockRef.current = await wakeLock.request("screen"); } catch (lockError) { console.warn("[voice/interview/wake-lock]", lockError); }
  }, []);

  const postEvent = useCallback(async (eventType: "question_started" | "highlight" | "follow_up" | "field_note", targetQuestion: InterviewQuestionSnapshot, payload: Record<string, unknown> = {}) => {
    const id = recordingIdRef.current;
    if (!id) return;
    const eventId = newEventId();
    const atSeconds = elapsedSeconds();
    const response = await fetch(`/api/voice/sessions/${id}/events`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ eventId, eventType, atSeconds, questionId: targetQuestion.id, payload }),
    });
    if (!response.ok) throw new Error(await errorFrom(response, "인터뷰 표시를 저장하지 못했습니다."));
    if (eventType === "question_started") {
      const next = [...markers, { eventId, questionId: targetQuestion.id, atSeconds }]; setMarkers(next); persistRecovery({ questionMarkers: next });
    } else if (eventType === "highlight") {
      const next = [...highlights, { eventId, questionId: targetQuestion.id, atSeconds }]; setHighlights(next); persistRecovery({ highlightMarkers: next });
    } else if (eventType === "field_note") {
      const next = [...notes, { eventId, questionId: targetQuestion.id, atSeconds, text: typeof payload.text === "string" ? payload.text : "" }]; setNotes(next); persistRecovery({ fieldNotes: next });
    } else {
      const next = [...followUps, { eventId, questionId: targetQuestion.id, atSeconds, text: typeof payload.text === "string" ? payload.text : "" }]; setFollowUps(next); persistRecovery({ followUps: next });
    }
  }, [elapsedSeconds, followUps, highlights, markers, notes, persistRecovery]);

  const uploadSegment = useCallback(async (segment: { blob: Blob; mimeType: string }, sequence: number, startSeconds: number, endSeconds: number) => {
    const id = recordingIdRef.current;
    if (!id || segment.blob.size === 0) return;
    const prepare = await fetch(`/api/voice/sessions/${id}/chunks`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sequence, startSeconds, endSeconds, mimeType: segment.mimeType, sizeBytes: segment.blob.size }),
    });
    if (!prepare.ok) throw new Error(await errorFrom(prepare, `${sequence}번 녹음 조각을 준비하지 못했습니다.`));
    const data = await prepare.json() as { alreadyUploaded?: boolean; path?: string; uploadToken?: string; mimeType?: string };
    if (!data.alreadyUploaded) {
      if (!data.path || !data.uploadToken) throw new Error(`${sequence}번 녹음 조각 업로드 주소가 없습니다.`);
      const upload = await getSupabase().storage.from(VOICE_RECORDINGS_BUCKET).uploadToSignedUrl(data.path, data.uploadToken, segment.blob, {
        contentType: baseAudioMimeType(data.mimeType || segment.mimeType),
      });
      if (upload.error) throw upload.error;
      const confirm = await fetch(`/api/voice/sessions/${id}/chunks`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sequence, uploaded: true, sizeBytes: segment.blob.size }),
      });
      if (!confirm.ok) throw new Error(await errorFrom(confirm, `${sequence}번 녹음 조각 업로드를 확인하지 못했습니다.`));
    }
    try {
      const recovery = normalizeInterviewRecoveryState(JSON.parse(localStorage.getItem(interviewRecoveryStorageKey(id)) || "null"));
      persistRecovery({ uploadedSequences: [...new Set([...(recovery?.uploadedSequences ?? []), sequence])].sort((left, right) => left - right) });
    } catch { persistRecovery({ uploadedSequences: [sequence] }); }
  }, [persistRecovery]);

  const uploadKnownSegment = useCallback(async (pending: PendingSegment) => {
    try {
      await uploadSegment(pending.segment, pending.sequence, pending.startSeconds, pending.endSeconds);
      failedSegmentsRef.current.delete(pending.sequence);
    } catch (uploadError) {
      // A four-minute recording stays in memory only until the representative can retry.
      // Already-uploaded segments are never re-recorded or discarded.
      failedSegmentsRef.current.set(pending.sequence, pending);
      throw uploadError;
    }
  }, [uploadSegment]);

  const retryFailedSegments = useCallback(async () => {
    const failed = [...failedSegmentsRef.current.values()].sort((left, right) => left.sequence - right.sequence);
    for (const pending of failed) await uploadKnownSegment(pending);
  }, [uploadKnownSegment]);

  const finalizeStoredAudio = useCallback(async (durationSeconds: number) => {
    const id = recordingIdRef.current;
    if (!id) throw new Error("인터뷰 녹음 세션을 찾을 수 없습니다.");
    await Promise.all([...pendingUploadsRef.current]);
    await retryFailedSegments();
    const response = await fetch(`/api/voice/sessions/${id}/finalize`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ durationSeconds }),
    });
    if (!response.ok) throw new Error(await errorFrom(response, "인터뷰 원본 저장을 확인하지 못했습니다."));
    try { localStorage.removeItem(interviewRecoveryStorageKey(id)); } catch (storageError) { console.warn("[voice/interview/recovery-clear]", storageError); }
    await fetch(`/api/voice/sessions/${id}/process`, { method: "POST" });
    await releaseWakeLock(); setStage("complete"); onComplete?.(id);
  }, [onComplete, releaseWakeLock, retryFailedSegments, setStage]);

  const rotateSegment = useCallback(async () => {
    const engine = engineRef.current;
    if (!engine || stageRef.current !== "recording") return;
    const startSeconds = currentChunkStartedAtRef.current;
    const endSeconds = elapsedSeconds();
    try {
      const segment = await engine.rotate();
      if (!segment) return;
      const sequence = nextSequenceRef.current++;
      currentChunkStartedAtRef.current = endSeconds;
      const pending = { segment, sequence, startSeconds, endSeconds };
      const work = uploadKnownSegment(pending).catch((uploadError) => {
        const message = uploadError instanceof Error ? uploadError.message : "녹음 조각 업로드에 실패했습니다.";
        setError(message); setNotice("녹음은 계속되고 있지만 이 조각은 아직 저장되지 않았습니다.");
        throw uploadError;
      });
      pendingUploadsRef.current.push(work);
      void work.finally(() => { pendingUploadsRef.current = pendingUploadsRef.current.filter((pendingUpload) => pendingUpload !== work); }).catch(() => undefined);
      persistRecoveryRef.current();
    } catch (rotateError) { setError(rotateError instanceof Error ? rotateError.message : "다음 녹음 조각을 시작하지 못했습니다."); }
  }, [elapsedSeconds, uploadKnownSegment]);

  const start = useCallback(async () => {
    if (!preparation.current_version_id || questions.length === 0) { setError("준비 완료된 질문 Snapshot이 없습니다."); return; }
    setStage("starting"); setError(""); setNotice(""); setElapsed(0); elapsedFrozenRef.current = 0; nextSequenceRef.current = 0;
    failedSegmentsRef.current.clear(); finalDurationRef.current = null;
    let engine: OliviaSegmentedBrowserRecorder | null = null;
    try {
      if (recovery) {
        if (recovery.preparationId !== preparation.id || recovery.versionId !== preparation.current_version_id) {
          throw new Error("복구할 인터뷰 질문 Snapshot이 현재 준비 상태와 다릅니다.");
        }
        const sessionResponse = await fetch(`/api/voice/sessions/${recovery.recordingId}`, { cache: "no-store" });
        if (!sessionResponse.ok) throw new Error(await errorFrom(sessionResponse, "복구할 인터뷰 녹음을 찾을 수 없습니다."));
        const session = await sessionResponse.json() as { recording_mode?: string; audio_chunks?: Array<{ end_seconds?: unknown }> };
        if (session.recording_mode !== "interview") throw new Error("복구할 수 있는 인터뷰 녹음이 아닙니다.");
        const lastStoredSecond = Math.max(0, ...(session.audio_chunks ?? []).map((chunk) => typeof chunk.end_seconds === "number" ? chunk.end_seconds : 0));
        recordingIdRef.current = recovery.recordingId; setRecordingId(recovery.recordingId);
        nextSequenceRef.current = nextMissingChunkSequence(recovery.uploadedSequences, recovery.currentChunk);
        elapsedFrozenRef.current = Math.floor(lastStoredSecond * 1_000);
        setElapsed(Math.floor(lastStoredSecond));
        setMarkers(recovery.questionMarkers); setHighlights(recovery.highlightMarkers); setNotes(recovery.fieldNotes); setFollowUps(recovery.followUps);
        const lastQuestionId = recovery.questionMarkers.at(-1)?.questionId;
        const recoveredIndex = questions.findIndex((candidate) => candidate.id === lastQuestionId);
        if (recoveredIndex >= 0) setQuestionIndex(recoveredIndex);
        setNotice("저장된 녹음 구간부터 이어갑니다. 이전에 업로드된 녹음은 다시 올리지 않습니다.");
      }
      engine = new OliviaSegmentedBrowserRecorder({ onWaveform: setWaveform, onStateWarning: setNotice });
      await engine.start();
      if (!recovery) {
        const response = await fetch("/api/voice/sessions", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mode: "interview", preparationId: preparation.id, versionId: preparation.current_version_id, mimeType: engine.mimeType, deviceType: detectOliviaDevice() }),
        });
        if (!response.ok) throw new Error(await errorFrom(response, "인터뷰 녹음 세션을 만들지 못했습니다."));
        const session = await response.json() as { id: string };
        recordingIdRef.current = session.id; setRecordingId(session.id);
        currentChunkStartedAtRef.current = 0;
      } else {
        currentChunkStartedAtRef.current = Math.floor(elapsedFrozenRef.current / 1_000);
      }
      engineRef.current = engine;
      startedAtRef.current = performance.now();
      timerRef.current = window.setInterval(() => setElapsed(elapsedSeconds()), 250);
      rotationRef.current = window.setInterval(() => void rotateSegment(), CHUNK_MS);
      setStage("recording"); await requestWakeLock();
      if (!recovery?.questionMarkers.length) await postEvent("question_started", questions[0]);
    } catch (startError) {
      await (engineRef.current ?? engine)?.stop().catch(() => undefined); engineRef.current = null;
      setError(startError instanceof Error ? startError.message : "인터뷰 녹음을 시작하지 못했습니다."); setStage("error");
    }
  }, [elapsedSeconds, postEvent, preparation.current_version_id, preparation.id, questions, recovery, requestWakeLock, rotateSegment, setStage]);

  const pause = useCallback(() => {
    engineRef.current?.pause();
    if (startedAtRef.current !== null) elapsedFrozenRef.current += performance.now() - startedAtRef.current;
    startedAtRef.current = null; setElapsed(Math.floor(elapsedFrozenRef.current / 1_000)); setStage("paused"); persistRecovery();
  }, [persistRecovery, setStage]);
  const resume = useCallback(() => {
    engineRef.current?.resume(); startedAtRef.current = performance.now(); setStage("recording"); void requestWakeLock();
  }, [requestWakeLock, setStage]);
  const moveQuestion = useCallback(async (delta: number) => {
    const next = questionIndex + delta;
    if (next < 0 || next >= questions.length || !questions[next]) return;
    setQuestionIndex(next);
    try { await postEvent("question_started", questions[next]); } catch (eventError) { setError(eventError instanceof Error ? eventError.message : "질문 시작 표시를 저장하지 못했습니다."); }
  }, [postEvent, questionIndex, questions]);
  const addHighlight = useCallback(async () => { if (question) try { await postEvent("highlight", question); } catch (eventError) { setError(eventError instanceof Error ? eventError.message : "좋은 답변 표시를 저장하지 못했습니다."); } }, [postEvent, question]);
  const addTextEvent = useCallback(async (type: "follow_up" | "field_note", title: string) => {
    if (!question) return;
    const text = window.prompt(title)?.trim(); if (!text) return;
    try { await postEvent(type, question, { text }); } catch (eventError) { setError(eventError instanceof Error ? eventError.message : "인터뷰 메모를 저장하지 못했습니다."); }
  }, [postEvent, question]);
  const finish = useCallback(async () => {
    const engine = engineRef.current; const id = recordingIdRef.current;
    if (!engine || !id || !window.confirm("인터뷰 녹음을 종료할까요?")) return;
    setStage("finishing"); clearTimers();
    if (startedAtRef.current !== null) elapsedFrozenRef.current += performance.now() - startedAtRef.current;
    startedAtRef.current = null; const durationSeconds = Math.floor(elapsedFrozenRef.current / 1_000); setElapsed(durationSeconds);
    try {
      const startSeconds = currentChunkStartedAtRef.current;
      const segment = await engine.stop(); engineRef.current = null;
      const sequence = nextSequenceRef.current++;
      const pending = { segment, sequence, startSeconds, endSeconds: durationSeconds };
      finalDurationRef.current = durationSeconds;
      await uploadKnownSegment(pending);
      await finalizeStoredAudio(durationSeconds);
    } catch (finishError) { setError(finishError instanceof Error ? finishError.message : "인터뷰 원본 저장을 끝내지 못했습니다."); setStage("error"); }
  }, [clearTimers, finalizeStoredAudio, setStage, uploadKnownSegment]);

  const retryFinish = useCallback(async () => {
    const durationSeconds = finalDurationRef.current;
    if (durationSeconds === null) return;
    setStage("finishing"); setError("");
    try {
      await finalizeStoredAudio(durationSeconds);
    } catch (finishError) {
      setError(finishError instanceof Error ? finishError.message : "인터뷰 원본 저장을 끝내지 못했습니다.");
      setStage("error");
    }
  }, [finalizeStoredAudio, setStage]);

  useEffect(() => {
    const visibility = () => { if (document.visibilityState === "hidden") { engineRef.current?.requestData(); persistRecovery(); } else void requestWakeLock(); };
    const pagehide = () => persistRecovery();
    const beforeUnload = (event: BeforeUnloadEvent) => { if (["recording", "paused", "finishing"].includes(stageRef.current)) { event.preventDefault(); event.returnValue = ""; } };
    document.addEventListener("visibilitychange", visibility); window.addEventListener("pagehide", pagehide); window.addEventListener("beforeunload", beforeUnload);
    return () => { document.removeEventListener("visibilitychange", visibility); window.removeEventListener("pagehide", pagehide); window.removeEventListener("beforeunload", beforeUnload); };
  }, [persistRecovery, requestWakeLock]);
  useEffect(() => () => {
    clearTimers();
    if (["recording", "paused", "finishing"].includes(stageRef.current)) {
      engineRef.current?.requestData();
      persistRecoveryRef.current();
      void engineRef.current?.stop().catch(() => undefined);
      engineRef.current = null;
    }
    void releaseWakeLock();
  }, [clearTimers, releaseWakeLock]);

  if (stage === "idle" || stage === "starting") return <section className={styles.start}><div className={styles.startIcon}><Mic size={28} /></div><p>INTERVIEW STANDBY</p><h1>{preparation.hospital_name}</h1><strong>{preparation.interviewee_name}</strong><span>{recovery ? `저장된 ${recovery.uploadedSequences.length}개 녹음 구간을 이어서 복구합니다.` : `질문 ${questions.length}개 · 병원에 전달한 질문지와 같은 순서로 진행합니다.`}</span>{error ? <div className={styles.error}><AlertCircle size={16} />{error}</div> : null}<div className={styles.startActions}><button type="button" onClick={onClose}>닫기</button><button type="button" className={styles.primary} disabled={stage === "starting"} onClick={() => void start()}>{stage === "starting" ? "마이크 준비 중…" : recovery ? "인터뷰 복구" : "인터뷰 시작"}</button></div></section>;
  if (stage === "complete") return <section className={styles.start}><div className={styles.completeIcon}><Check size={30} /></div><p>ORIGINAL AUDIO STORED</p><h1>인터뷰 원본을 저장했어요</h1><span>AI 전사와 브랜드 정리는 별도로 진행됩니다. 원본·질문·현장 메모는 유지됩니다.</span><div className={styles.startActions}><button type="button" onClick={onClose}>목록으로</button>{recordingId ? <button type="button" className={styles.primary} onClick={() => onComplete?.(recordingId)}>결과 보기</button> : null}</div></section>;
  if (stage === "error") return <section className={styles.start}><div className={styles.errorIcon}><AlertCircle size={30} /></div><p>저장 확인 필요</p><h1>인터뷰를 완료하지 못했어요</h1><div className={styles.error}><AlertCircle size={16} />{error}</div><span>이미 확인된 녹음 조각은 지우지 않았습니다. 이 화면을 닫기 전에 저장을 다시 시도할 수 있습니다.</span><div className={styles.startActions}><button type="button" onClick={onClose}>목록으로</button>{finalDurationRef.current !== null ? <button type="button" className={styles.primary} onClick={() => void retryFinish()}>저장 다시 시도</button> : null}</div></section>;
  return <section className={styles.recorder} aria-live="polite"><header><button type="button" onClick={onClose} aria-label="인터뷰 닫기"><ArrowLeft size={18} /></button><span className={stage === "paused" ? styles.paused : styles.live}><i />{stage === "paused" ? "PAUSED" : "REC"}</span><time>{formatTime(elapsed)}</time></header><div className={styles.questionProgress}>질문 {questionIndex + 1} / {questions.length}</div><h1>{question?.text}</h1><p className={styles.section}>{question?.sectionTitle}</p><div className={styles.waveform}>{waveform.map((height, index) => <i key={index} style={{ height: `${Math.max(6, height * 100)}%` }} />)}</div>{notice ? <p className={styles.notice}><AlertCircle size={14} />{notice}</p> : null}<div className={styles.questionActions}><button type="button" disabled={questionIndex === 0} onClick={() => void moveQuestion(-1)}><ChevronLeft size={17} />이전 질문</button><button type="button" disabled={questionIndex === questions.length - 1} onClick={() => void moveQuestion(1)}>다음 질문<ChevronRight size={17} /></button></div><div className={styles.markerActions}><button type="button" onClick={() => void addHighlight()}><Star size={16} />좋은 답변</button><button type="button" onClick={() => void addTextEvent("follow_up", "후속 질문을 입력해주세요")}> <MessageSquarePlus size={16} />후속 질문</button><button type="button" onClick={() => void addTextEvent("field_note", "현장 메모를 입력해주세요")}> <FileText size={16} />현장 메모</button></div><footer><button type="button" onClick={stage === "paused" ? resume : pause}>{stage === "paused" ? <Play size={18} /> : <Pause size={18} />}{stage === "paused" ? "계속" : "일시정지"}</button><button type="button" className={styles.stop} onClick={() => void finish()}><Square size={18} />종료</button></footer></section>;
}
