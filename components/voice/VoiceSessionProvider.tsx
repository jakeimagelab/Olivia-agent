"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { getSupabase } from "@/lib/supabase";
import { OliviaBrowserRecorder, type RecorderQuality } from "@/lib/voice/browserRecorder";
import { baseAudioMimeType, VOICE_RECORDINGS_BUCKET, VOICE_UPLOAD_STORAGE_PREFIX } from "@/lib/voice/config";
import {
  persistLocalCapture,
  listLocalCaptures,
  removeLocalCapture,
  persistLocalEvent,
  listLocalEvents,
  removeLocalEvent,
} from "@/lib/voice/recordingPersistence";
import { OliviaSegmentedBrowserRecorder } from "@/lib/voice/segmentedBrowserRecorder";
import type { InterviewFieldNote, InterviewFollowUp, InterviewHighlight, InterviewMarker, InterviewQuestionSnapshot } from "@/lib/voice/interview/types";
import type { SpeakerHint, VoiceStatus } from "@/lib/voice/types";
import { detectOliviaDevice } from "@/lib/device/detectDevice";

export type CaptureStatus = "idle" | "starting" | "recording" | "paused" | "interrupted" | "stopping" | "stopped" | "error";
export type StorageStatus = "none" | "local" | "uploading" | "stored" | "partial" | "failed";
export type AnalysisStatus = "idle" | "queued" | "transcribing" | "summarizing" | "completed" | "failed";
export type VoiceSessionKind = "general" | "interview" | null;

export type PreparedInterview = {
  preparationId: string;
  versionId: string;
  hospitalName: string;
  intervieweeName: string;
  questions: InterviewQuestionSnapshot[];
};

type QueuedEvent = {
  eventId: string;
  eventType: "question_started" | "highlight" | "follow_up" | "field_note";
  questionId: string;
  atSeconds: number;
  clientSequence: number;
  audioEpochId: string;
  payload: Record<string, unknown>;
};

type InterviewEvents = {
  markers: InterviewMarker[];
  highlights: InterviewHighlight[];
  notes: InterviewFieldNote[];
  followUps: InterviewFollowUp[];
};

export type VoiceSessionState = {
  kind: VoiceSessionKind;
  capture: CaptureStatus;
  storage: StorageStatus;
  analysis: AnalysisStatus;
  recordingId: string | null;
  elapsedMilliseconds: number;
  waveform: number[];
  speakerHints: SpeakerHint[];
  notice: string;
  error: string;
  target: PreparedInterview | null;
  viewedQuestionId: string | null;
  activeQuestionId: string | null;
  events: InterviewEvents;
  quality: RecorderQuality | null;
  resultId: string | null;
};

type VoiceSessionContextValue = {
  state: VoiceSessionState;
  prepareGeneral: () => void;
  prepareInterview: (target: PreparedInterview) => void;
  start: () => Promise<void>;
  pause: () => void;
  resume: () => void;
  stop: () => Promise<void>;
  retryStorage: () => Promise<void>;
  setViewedQuestion: (questionId: string) => void;
  beginQuestion: (questionId: string) => void;
  addHighlight: () => void;
  addFieldNote: (text: string) => void;
  addFollowUp: (text: string) => void;
  dismissResult: () => void;
};

const EMPTY_EVENTS: InterviewEvents = { markers: [], highlights: [], notes: [], followUps: [] };
const EMPTY_WAVEFORM = Array(48).fill(.05);
const RUNTIME_STORAGE_KEY = "olivia-voice-runtime:v2";
const TAB_LOCK_KEY = "olivia-voice-capture-lock:v1";
const CHUNK_MS = 60_000;

const initialState: VoiceSessionState = {
  kind: null,
  capture: "idle",
  storage: "none",
  analysis: "idle",
  recordingId: null,
  elapsedMilliseconds: 0,
  waveform: EMPTY_WAVEFORM,
  speakerHints: [],
  notice: "",
  error: "",
  target: null,
  viewedQuestionId: null,
  activeQuestionId: null,
  events: EMPTY_EVENTS,
  quality: null,
  resultId: null,
};

const VoiceSessionContext = createContext<VoiceSessionContextValue | null>(null);

function readError(response: Response, fallback: string) {
  return response.json().then((body: { error?: unknown }) => typeof body.error === "string" ? body.error : fallback).catch(() => fallback);
}

function createEventId() {
  return crypto.randomUUID();
}

function runtimeSnapshot(state: VoiceSessionState) {
  return {
    version: 2,
    kind: state.kind,
    capture: state.capture,
    storage: state.storage,
    analysis: state.analysis,
    recordingId: state.recordingId,
    elapsedMilliseconds: state.elapsedMilliseconds,
    speakerHints: state.speakerHints,
    target: state.target,
    viewedQuestionId: state.viewedQuestionId,
    activeQuestionId: state.activeQuestionId,
    events: state.events,
    quality: state.quality,
    resultId: state.resultId,
    updatedAt: new Date().toISOString(),
  };
}

function safeRuntimeSnapshot(value: unknown): Partial<VoiceSessionState> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const source = value as Record<string, unknown>;
  if (source.kind !== "general" && source.kind !== "interview") return null;
  const capture = source.capture;
  if (typeof capture !== "string") return null;
  return {
    kind: source.kind,
    capture: capture === "recording" || capture === "paused" || capture === "starting" ? "interrupted" : "stopped",
    storage: typeof source.storage === "string" ? source.storage as StorageStatus : "partial",
    analysis: typeof source.analysis === "string" ? source.analysis as AnalysisStatus : "idle",
    recordingId: typeof source.recordingId === "string" ? source.recordingId : null,
    elapsedMilliseconds: typeof source.elapsedMilliseconds === "number" && Number.isFinite(source.elapsedMilliseconds) ? source.elapsedMilliseconds : 0,
    speakerHints: Array.isArray(source.speakerHints) ? source.speakerHints as SpeakerHint[] : [],
    target: source.target && typeof source.target === "object" ? source.target as PreparedInterview : null,
    viewedQuestionId: typeof source.viewedQuestionId === "string" ? source.viewedQuestionId : null,
    activeQuestionId: typeof source.activeQuestionId === "string" ? source.activeQuestionId : null,
    events: source.events && typeof source.events === "object" ? source.events as InterviewEvents : EMPTY_EVENTS,
    quality: source.quality && typeof source.quality === "object" ? source.quality as RecorderQuality : null,
    resultId: typeof source.resultId === "string" ? source.resultId : null,
    notice: "이전 녹음은 브라우저가 종료되어 중단되었습니다. 기기에 저장된 구간을 확인하거나 업로드를 재시도하세요.",
  };
}

export function VoiceSessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<VoiceSessionState>(initialState);
  const stateRef = useRef(state);
  const generalRecorderRef = useRef<OliviaBrowserRecorder | null>(null);
  const interviewRecorderRef = useRef<OliviaSegmentedBrowserRecorder | null>(null);
  const timerRef = useRef<number | null>(null);
  const rotationRef = useRef<number | null>(null);
  const activeClockRef = useRef<number | null>(null);
  const accumulatedMsRef = useRef(0);
  const segmentStartMsRef = useRef(0);
  const nextSequenceRef = useRef(0);
  const rotatingRef = useRef(false);
  const uploadQueueRef = useRef<Promise<void>[]>([]);
  const clientSequenceRef = useRef(0);
  const eventQueueRef = useRef(Promise.resolve());
  const tabIdRef = useRef(crypto.randomUUID());
  const heartbeatRef = useRef<number | null>(null);

  useEffect(() => { stateRef.current = state; }, [state]);
  const patch = useCallback((next: Partial<VoiceSessionState> | ((current: VoiceSessionState) => Partial<VoiceSessionState>)) => {
    setState((current) => {
      const updated = { ...current, ...(typeof next === "function" ? next(current) : next) };
      // Command handlers can issue several synchronous state transitions (notably
      // recordingId → first question marker). Keep their source of truth current.
      stateRef.current = updated;
      return updated;
    });
  }, []);

  const elapsedNow = useCallback(() => {
    const active = activeClockRef.current === null ? 0 : performance.now() - activeClockRef.current;
    return Math.max(0, accumulatedMsRef.current + active);
  }, []);
  const refreshElapsed = useCallback(() => patch({ elapsedMilliseconds: elapsedNow() }), [elapsedNow, patch]);
  const stopClock = useCallback((commit: boolean) => {
    if (commit && activeClockRef.current !== null) accumulatedMsRef.current += performance.now() - activeClockRef.current;
    activeClockRef.current = null;
    if (timerRef.current !== null) window.clearInterval(timerRef.current);
    timerRef.current = null;
    patch({ elapsedMilliseconds: accumulatedMsRef.current });
  }, [patch]);
  const startClock = useCallback(() => {
    activeClockRef.current = performance.now();
    if (timerRef.current !== null) window.clearInterval(timerRef.current);
    timerRef.current = window.setInterval(refreshElapsed, 250);
    refreshElapsed();
  }, [refreshElapsed]);
  const clearRotation = useCallback(() => {
    if (rotationRef.current !== null) window.clearInterval(rotationRef.current);
    rotationRef.current = null;
  }, []);
  const releaseTabLock = useCallback(() => {
    try {
      const lock = JSON.parse(localStorage.getItem(TAB_LOCK_KEY) || "null") as { tabId?: string } | null;
      if (lock?.tabId === tabIdRef.current) localStorage.removeItem(TAB_LOCK_KEY);
    } catch (error) { void error; }
    if (heartbeatRef.current !== null) window.clearInterval(heartbeatRef.current);
    heartbeatRef.current = null;
  }, []);
  const claimTabLock = useCallback(() => {
    try {
      const now = Date.now();
      const current = JSON.parse(localStorage.getItem(TAB_LOCK_KEY) || "null") as { tabId?: string; updatedAt?: number } | null;
      if (current?.tabId && current.tabId !== tabIdRef.current && typeof current.updatedAt === "number" && now - current.updatedAt < 15_000) {
        throw new Error("다른 Olivia 탭에서 이미 녹음 중입니다. 진행 중인 녹음 화면을 먼저 확인해주세요.");
      }
      const save = () => localStorage.setItem(TAB_LOCK_KEY, JSON.stringify({ tabId: tabIdRef.current, updatedAt: Date.now() }));
      save();
      if (heartbeatRef.current !== null) window.clearInterval(heartbeatRef.current);
      heartbeatRef.current = window.setInterval(save, 4_000);
    } catch (error) {
      if (error instanceof Error) throw error;
      throw new Error("진행 중인 녹음 상태를 확인하지 못했습니다.");
    }
  }, []);

  const persistRuntime = useCallback((nextState = stateRef.current) => {
    try { localStorage.setItem(RUNTIME_STORAGE_KEY, JSON.stringify(runtimeSnapshot(nextState))); } catch (error) { void error; }
  }, []);

  const requestWakeLock = useCallback(async () => {
    if (document.visibilityState !== "visible" || !["recording", "paused"].includes(stateRef.current.capture)) return;
    const wakeLock = (navigator as Navigator & { wakeLock?: { request: (type: "screen") => Promise<{ released?: boolean; release: () => Promise<void> }> } }).wakeLock;
    if (!wakeLock) return;
    try { await wakeLock.request("screen"); } catch (error) { void error; }
  }, []);

  const patchServerSession = useCallback(async (id: string, body: Record<string, unknown>) => {
    const response = await fetch(`/api/voice/sessions/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (!response.ok) throw new Error(await readError(response, "녹음 상태 저장에 실패했습니다."));
  }, []);

  const pollAnalysis = useCallback(async (id: string) => {
    try {
      const response = await fetch(`/api/voice/sessions/${id}`, { cache: "no-store" });
      if (!response.ok) return;
      const recording = await response.json() as { status?: VoiceStatus; analysis_status?: string; error_message?: string | null };
      if (recording.status === "completed" || recording.analysis_status === "completed") patch({ analysis: "completed", resultId: id });
      else if (recording.status === "error" || recording.analysis_status === "failed") patch({ analysis: "failed", error: recording.error_message || "AI 정리에 실패했습니다. 원본 음성은 저장되어 있습니다." });
      else if (recording.analysis_status === "transcribing") patch({ analysis: "transcribing" });
      else if (recording.analysis_status === "summarizing") patch({ analysis: "summarizing" });
    } catch (error) { void error; }
  }, [patch]);

  const beginAnalysis = useCallback(async (id: string) => {
    patch({ analysis: "queued" });
    try {
      const response = await fetch(`/api/voice/sessions/${id}/process`, { method: "POST" });
      if (!response.ok && response.status !== 409) throw new Error(await readError(response, "AI 정리를 시작하지 못했습니다."));
      await pollAnalysis(id);
    } catch (error) {
      patch({ analysis: "failed", error: error instanceof Error ? error.message : "AI 정리를 시작하지 못했습니다." });
    }
  }, [patch, pollAnalysis]);

  const uploadEvent = useCallback(async (recordingId: string, event: QueuedEvent) => {
    const response = await fetch(`/api/voice/sessions/${recordingId}/events`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(event),
      });
    if (!response.ok) throw new Error(await readError(response, "질문 표시를 저장하지 못했습니다."));
  }, []);

  const persistEvent = useCallback((event: QueuedEvent) => {
    const recordingId = stateRef.current.recordingId;
    if (!recordingId) return;
    eventQueueRef.current = eventQueueRef.current.then(async () => {
      // The local transaction is the acknowledgement point. Network delivery
      // is retried later with this stable eventId, never recreated on retry.
      await persistLocalEvent({ recordingId, ...event });
      await uploadEvent(recordingId, event);
      await removeLocalEvent(recordingId, event.eventId);
    }).catch((error) => {
      patch({ storage: "partial", notice: error instanceof Error ? `${error.message} 기기에 보관한 뒤 다시 시도합니다.` : "질문 표시 저장을 다시 시도합니다." });
    });
  }, [patch, uploadEvent]);

  const appendEvent = useCallback((eventType: QueuedEvent["eventType"], questionId: string, payload: Record<string, unknown> = {}) => {
    const current = stateRef.current;
    if (!current.recordingId || current.kind !== "interview" || !current.target) return;
    const atSeconds = elapsedNow() / 1_000;
    const event: QueuedEvent = {
      eventId: createEventId(), eventType, questionId, atSeconds,
      clientSequence: ++clientSequenceRef.current,
      audioEpochId: `capture-${current.recordingId}`,
      payload,
    };
    patch((existing) => {
      const events = existing.events;
      if (eventType === "question_started") return { activeQuestionId: questionId, events: { ...events, markers: [...events.markers, { eventId: event.eventId, questionId, atSeconds, clientSequence: event.clientSequence, audioEpochId: event.audioEpochId }] } };
      if (eventType === "highlight") return { events: { ...events, highlights: [...events.highlights, { eventId: event.eventId, questionId, atSeconds, clientSequence: event.clientSequence, audioEpochId: event.audioEpochId }] } };
      if (eventType === "field_note") return { events: { ...events, notes: [...events.notes, { eventId: event.eventId, questionId, atSeconds, text: typeof payload.text === "string" ? payload.text : "", clientSequence: event.clientSequence, audioEpochId: event.audioEpochId }] } };
      return { events: { ...events, followUps: [...events.followUps, { eventId: event.eventId, questionId, atSeconds, text: typeof payload.text === "string" ? payload.text : "", clientSequence: event.clientSequence, audioEpochId: event.audioEpochId }] } };
    });
    persistEvent(event);
  }, [elapsedNow, patch, persistEvent]);

  const uploadInterviewSegment = useCallback(async (recordingId: string, sequence: number, startMilliseconds: number, endMilliseconds: number, blob: Blob, mimeType: string) => {
    await persistLocalCapture({ recordingId, sequence, blob, startMilliseconds, endMilliseconds, mimeType });
    patch({ storage: "local" });
    const prepared = await fetch(`/api/voice/sessions/${recordingId}/chunks`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sequence, startSeconds: startMilliseconds / 1_000, endSeconds: endMilliseconds / 1_000, mimeType, sizeBytes: blob.size }),
    });
    if (!prepared.ok) throw new Error(await readError(prepared, `${sequence + 1}번 녹음 구간을 준비하지 못했습니다.`));
    const uploadInfo = await prepared.json() as { alreadyUploaded?: boolean; path?: string; uploadToken?: string; mimeType?: string };
    if (!uploadInfo.alreadyUploaded) {
      if (!uploadInfo.path || !uploadInfo.uploadToken) throw new Error("녹음 구간 업로드 주소가 없습니다.");
      const upload = await getSupabase().storage.from(VOICE_RECORDINGS_BUCKET).uploadToSignedUrl(uploadInfo.path, uploadInfo.uploadToken, blob, { contentType: baseAudioMimeType(uploadInfo.mimeType || mimeType) });
      if (upload.error) throw upload.error;
      const confirmed = await fetch(`/api/voice/sessions/${recordingId}/chunks`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sequence, uploaded: true, sizeBytes: blob.size }),
      });
      if (!confirmed.ok) throw new Error(await readError(confirmed, `${sequence + 1}번 녹음 구간 저장을 확인하지 못했습니다.`));
    }
    await removeLocalCapture(recordingId, sequence);
    patch((current) => ({ storage: current.storage === "partial" ? "partial" : "uploading" }));
  }, [patch]);

  const rotateInterviewSegment = useCallback(async () => {
    const current = stateRef.current;
    const engine = interviewRecorderRef.current;
    if (!engine || current.capture !== "recording" || rotatingRef.current || !current.recordingId) return;
    rotatingRef.current = true;
    const startMilliseconds = segmentStartMsRef.current;
    const endMilliseconds = elapsedNow();
    try {
      const segment = await engine.rotate();
      if (!segment || segment.blob.size === 0) return;
      const sequence = nextSequenceRef.current++;
      segmentStartMsRef.current = endMilliseconds;
      const work = uploadInterviewSegment(current.recordingId, sequence, startMilliseconds, endMilliseconds, segment.blob, segment.mimeType)
        .catch((error) => {
          patch({ storage: "partial", notice: error instanceof Error ? `${error.message} 녹음은 계속됩니다.` : "이 녹음 구간은 업로드 대기입니다." });
          throw error;
        });
      uploadQueueRef.current.push(work);
      void work.finally(() => { uploadQueueRef.current = uploadQueueRef.current.filter((item) => item !== work); }).catch(() => undefined);
    } catch (error) {
      patch({ storage: "partial", notice: error instanceof Error ? error.message : "다음 녹음 구간을 시작하지 못했습니다." });
    } finally {
      rotatingRef.current = false;
    }
  }, [elapsedNow, patch, uploadInterviewSegment]);

  const interrupted = useCallback((message: string) => {
    const current = stateRef.current;
    if (!["recording", "paused", "starting"].includes(current.capture)) return;
    clearRotation();
    stopClock(true);
    patch({ capture: "interrupted", storage: current.storage === "stored" ? "stored" : "partial", notice: message });
    persistRuntime({ ...stateRef.current, capture: "interrupted", notice: message });
    releaseTabLock();
  }, [clearRotation, patch, persistRuntime, releaseTabLock, stopClock]);

  const start = useCallback(async () => {
    const current = stateRef.current;
    if (!current.kind || ["starting", "recording", "paused", "stopping"].includes(current.capture)) return;
    if (current.kind === "interview" && !current.target) {
      patch({ error: "먼저 준비 완료된 인터뷰를 선택해주세요.", capture: "error" });
      return;
    }
    try {
      claimTabLock();
      accumulatedMsRef.current = 0;
      nextSequenceRef.current = 0;
      clientSequenceRef.current = 0;
      patch({ capture: "starting", storage: "none", analysis: "idle", recordingId: null, elapsedMilliseconds: 0, waveform: EMPTY_WAVEFORM, speakerHints: [], error: "", notice: "", resultId: null, activeQuestionId: null, events: EMPTY_EVENTS, quality: null });
      if (current.kind === "general") {
        const engine = new OliviaBrowserRecorder({
          onWaveform: (waveform) => patch({ waveform }),
          onStateWarning: (notice) => patch({ notice }),
          onInterrupted: interrupted,
          onSpeakerHint: (speaker, confidence) => patch((existing) => ({
            speakerHints: [...existing.speakerHints, {
              at: elapsedNow() / 1_000,
              speaker,
              confidence,
            }].slice(-1_000),
          })),
        });
        await engine.start();
        generalRecorderRef.current = engine;
        startClock();
        patch({ capture: "recording", quality: engine.quality });
        const response = await fetch("/api/voice/sessions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mimeType: engine.mimeType, captureQuality: engine.quality, deviceType: detectOliviaDevice() }) });
        if (!response.ok) throw new Error(await readError(response, "녹음 세션을 만들지 못했습니다."));
        const session = await response.json() as { id: string; path?: string; uploadToken?: string; mimeType?: string };
        if (!session.path || !session.uploadToken) throw new Error("녹음 업로드 정보를 받지 못했습니다.");
        localStorage.setItem(`${VOICE_UPLOAD_STORAGE_PREFIX}${session.id}`, JSON.stringify({ path: session.path, token: session.uploadToken, mimeType: session.mimeType || engine.mimeType }));
        patch({ recordingId: session.id });
      } else {
        const target = current.target!;
        const engine = new OliviaSegmentedBrowserRecorder({ onWaveform: (waveform) => patch({ waveform }), onStateWarning: (notice) => patch({ notice }), onInterrupted: interrupted });
        await engine.start();
        interviewRecorderRef.current = engine;
        startClock();
        patch({ capture: "recording", quality: engine.quality });
        const response = await fetch("/api/voice/sessions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode: "interview", preparationId: target.preparationId, versionId: target.versionId, mimeType: engine.mimeType, captureQuality: engine.quality, deviceType: detectOliviaDevice() }) });
        if (!response.ok) throw new Error(await readError(response, "인터뷰 녹음 세션을 만들지 못했습니다."));
        const session = await response.json() as { id: string };
        segmentStartMsRef.current = 0;
        patch({ recordingId: session.id });
        rotationRef.current = window.setInterval(() => void rotateInterviewSegment(), CHUNK_MS);
        // A representative may preview questions before starting. The first
        // marker must reflect the explicitly selected starting question, not a
        // hard-coded first list item.
        const first = target.questions.find((question) => question.id === stateRef.current.viewedQuestionId) ?? target.questions[0];
        if (first) appendEvent("question_started", first.id);
      }
      void requestWakeLock();
    } catch (error) {
      stopClock(true);
      clearRotation();
      await generalRecorderRef.current?.stop().catch(() => undefined);
      await interviewRecorderRef.current?.stop().catch(() => undefined);
      generalRecorderRef.current = null;
      interviewRecorderRef.current = null;
      releaseTabLock();
      patch({ capture: "error", error: error instanceof DOMException && error.name === "NotAllowedError" ? "마이크 사용이 허용되지 않았습니다. 브라우저 설정에서 마이크 권한을 허용해주세요." : error instanceof Error ? error.message : "녹음을 시작하지 못했습니다." });
    }
  }, [appendEvent, claimTabLock, clearRotation, elapsedNow, interrupted, patch, releaseTabLock, requestWakeLock, rotateInterviewSegment, startClock, stopClock]);

  const pause = useCallback(() => {
    const current = stateRef.current;
    if (current.capture !== "recording") return;
    if (current.kind === "general") generalRecorderRef.current?.pause();
    else interviewRecorderRef.current?.pause();
    stopClock(true);
    patch({ capture: "paused", waveform: EMPTY_WAVEFORM });
  }, [patch, stopClock]);
  const resume = useCallback(() => {
    const current = stateRef.current;
    if (current.capture !== "paused") return;
    if (current.kind === "general") generalRecorderRef.current?.resume();
    else interviewRecorderRef.current?.resume();
    startClock();
    patch({ capture: "recording", notice: "" });
    void requestWakeLock();
  }, [patch, requestWakeLock, startClock]);

  const uploadGeneral = useCallback(async (recordingId: string, blob: Blob, mimeType: string) => {
    await persistLocalCapture({ recordingId, sequence: null, blob, startMilliseconds: 0, endMilliseconds: accumulatedMsRef.current, mimeType });
    patch({ storage: "local" });
    const pendingRaw = localStorage.getItem(`${VOICE_UPLOAD_STORAGE_PREFIX}${recordingId}`);
    const pending = pendingRaw ? JSON.parse(pendingRaw) as { path?: string; token?: string; mimeType?: string } : null;
    if (!pending?.path || !pending.token) throw new Error("녹음 업로드 정보를 찾지 못했습니다.");
    patch({ storage: "uploading" });
    await patchServerSession(recordingId, {
      status: "uploading",
      durationSeconds: Math.round(accumulatedMsRef.current / 1_000),
      mimeType,
      liveSpeakerHints: stateRef.current.speakerHints,
    });
    const upload = await getSupabase().storage.from(VOICE_RECORDINGS_BUCKET).uploadToSignedUrl(pending.path, pending.token, blob, { contentType: baseAudioMimeType(pending.mimeType || mimeType) });
    if (upload.error) throw upload.error;
    await patchServerSession(recordingId, {
      status: "uploaded",
      durationSeconds: Math.round(accumulatedMsRef.current / 1_000),
      mimeType,
      liveSpeakerHints: stateRef.current.speakerHints,
    });
    await removeLocalCapture(recordingId, null);
    localStorage.removeItem(`${VOICE_UPLOAD_STORAGE_PREFIX}${recordingId}`);
    patch({ storage: "stored" });
    await beginAnalysis(recordingId);
  }, [beginAnalysis, patch, patchServerSession]);

  const stop = useCallback(async () => {
    const current = stateRef.current;
    if (!["recording", "paused", "interrupted"].includes(current.capture)) return;
    const recordingId = current.recordingId;
    if (!recordingId) {
      interrupted("녹음 세션을 확인하지 못했습니다.");
      return;
    }
    patch({ capture: "stopping", notice: "녹음을 종료하고 안전하게 저장하고 있습니다." });
    clearRotation();
    stopClock(true);
    try {
      if (current.kind === "general") {
        const engine = generalRecorderRef.current;
        if (!engine) throw new Error("녹음 엔진을 찾을 수 없습니다.");
        const blob = await engine.stop();
        generalRecorderRef.current = null;
        patch({ capture: "stopped" });
        await uploadGeneral(recordingId, blob, engine.mimeType);
      } else {
        const engine = interviewRecorderRef.current;
        if (!engine) throw new Error("인터뷰 녹음 엔진을 찾을 수 없습니다.");
        const segment = await engine.stop();
        interviewRecorderRef.current = null;
        const sequence = nextSequenceRef.current++;
        await uploadInterviewSegment(recordingId, sequence, segmentStartMsRef.current, accumulatedMsRef.current, segment.blob, segment.mimeType);
        const uploads = await Promise.allSettled(uploadQueueRef.current);
        await eventQueueRef.current;
        const pendingEvents = await listLocalEvents(recordingId);
        if (uploads.some((upload) => upload.status === "rejected") || stateRef.current.storage === "partial" || pendingEvents.length) {
          throw new Error("일부 녹음 구간 또는 질문 표시가 아직 기기에 저장되어 있습니다. 업로드를 다시 시도한 뒤 원본 저장을 완료해주세요.");
        }
        const response = await fetch(`/api/voice/sessions/${recordingId}/finalize`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ durationSeconds: accumulatedMsRef.current / 1_000 }) });
        if (!response.ok) throw new Error(await readError(response, "인터뷰 원본 저장을 확인하지 못했습니다."));
        patch({ capture: "stopped", storage: "stored", analysis: "queued", resultId: recordingId, notice: "원본 저장이 완료되었습니다. AI 정리를 시작합니다." });
        await beginAnalysis(recordingId);
      }
      releaseTabLock();
    } catch (error) {
      patch({ capture: "stopped", storage: "partial", error: error instanceof Error ? error.message : "마지막 녹음 구간 저장을 확인하지 못했습니다.", notice: "저장된 구간은 보존되어 있습니다. 업로드를 다시 시도하세요." });
      releaseTabLock();
    }
  }, [beginAnalysis, clearRotation, interrupted, patch, releaseTabLock, stopClock, uploadGeneral, uploadInterviewSegment]);

  const retryStorage = useCallback(async () => {
    const current = stateRef.current;
    if (!current.recordingId) return;
    patch({ error: "", notice: "기기에 저장한 녹음 구간을 다시 업로드하고 있습니다." });
    try {
      const captures = await listLocalCaptures(current.recordingId);
      const events = await listLocalEvents(current.recordingId);
      if (!captures.length && !events.length) throw new Error("기기에 다시 올릴 녹음 구간이나 질문 표시가 없습니다.");
      for (const capture of captures.sort((left, right) => (left.sequence ?? -1) - (right.sequence ?? -1))) {
        if (capture.sequence === null) await uploadGeneral(current.recordingId, capture.blob, capture.blob.type || "audio/webm");
        else await uploadInterviewSegment(
          current.recordingId,
          capture.sequence,
          capture.startMilliseconds ?? 0,
          capture.endMilliseconds ?? accumulatedMsRef.current,
          capture.blob,
          capture.mimeType || capture.blob.type || "audio/webm",
        );
      }
      for (const event of events) {
        await uploadEvent(current.recordingId, event);
        await removeLocalEvent(current.recordingId, event.eventId);
      }
      if (current.kind === "interview" && current.capture === "stopped") {
        const finalize = await fetch(`/api/voice/sessions/${current.recordingId}/finalize`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ durationSeconds: accumulatedMsRef.current / 1_000 }),
        });
        if (!finalize.ok) throw new Error(await readError(finalize, "인터뷰 원본 저장을 확인하지 못했습니다."));
        patch({ storage: "stored", analysis: "queued", resultId: current.recordingId, notice: "기기에 저장한 녹음 구간을 업로드했습니다. AI 정리를 시작합니다." });
        await beginAnalysis(current.recordingId);
      } else {
        patch({ storage: "stored", notice: "기기에 저장한 녹음 구간을 업로드했습니다." });
      }
    } catch (error) {
      patch({ storage: "partial", error: error instanceof Error ? error.message : "업로드를 다시 시도하지 못했습니다." });
    }
  }, [beginAnalysis, patch, uploadEvent, uploadGeneral, uploadInterviewSegment]);

  const prepareGeneral = useCallback(() => {
    const current = stateRef.current;
    if (["recording", "paused", "starting", "stopping"].includes(current.capture)) return;
    patch({ kind: "general", capture: current.capture === "interrupted" ? "interrupted" : "idle", target: null, viewedQuestionId: null, activeQuestionId: null, error: "", notice: current.capture === "interrupted" ? current.notice : "" });
  }, [patch]);
  const prepareInterview = useCallback((target: PreparedInterview) => {
    const current = stateRef.current;
    if (["recording", "paused", "starting", "stopping"].includes(current.capture)) {
      if (current.target?.preparationId !== target.preparationId) patch({ notice: "진행 중인 녹음을 다른 인터뷰로 바꿀 수 없습니다. 먼저 종료하거나 진행 중인 녹음으로 이동하세요." });
      return;
    }
    patch({ kind: "interview", target, capture: current.capture === "interrupted" ? "interrupted" : "idle", viewedQuestionId: target.questions[0]?.id || null, activeQuestionId: null, error: "", notice: current.capture === "interrupted" ? current.notice : "" });
  }, [patch]);
  const setViewedQuestion = useCallback((questionId: string) => {
    if (stateRef.current.target?.questions.some((question) => question.id === questionId)) patch({ viewedQuestionId: questionId });
  }, [patch]);
  const beginQuestion = useCallback((questionId: string) => {
    const current = stateRef.current;
    if (current.capture === "paused") { patch({ notice: "일시정지 중에는 질문 진행을 시작할 수 없습니다. 녹음을 계속한 뒤 진행해주세요." }); return; }
    if (current.capture !== "recording") { patch({ notice: "실제 녹음이 시작된 뒤에 질문 진행 표시를 남길 수 있습니다." }); return; }
    if (!current.target?.questions.some((question) => question.id === questionId)) return;
    appendEvent("question_started", questionId);
  }, [appendEvent, patch]);
  const addHighlight = useCallback(() => {
    const questionId = stateRef.current.activeQuestionId;
    if (questionId && stateRef.current.capture === "recording") appendEvent("highlight", questionId);
  }, [appendEvent]);
  const addFieldNote = useCallback((text: string) => {
    const questionId = stateRef.current.activeQuestionId;
    if (questionId && text.trim()) appendEvent("field_note", questionId, { text: text.trim() });
  }, [appendEvent]);
  const addFollowUp = useCallback((text: string) => {
    const questionId = stateRef.current.activeQuestionId;
    if (questionId && text.trim()) appendEvent("follow_up", questionId, { text: text.trim() });
  }, [appendEvent]);
  const dismissResult = useCallback(() => {
    const current = stateRef.current;
    if (["recording", "paused", "starting", "stopping"].includes(current.capture)) return;
    patch({ kind: null, target: null, resultId: null, notice: "", error: "", capture: "idle", storage: "none", analysis: "idle" });
    try { localStorage.removeItem(RUNTIME_STORAGE_KEY); } catch (error) { void error; }
  }, [patch]);

  useEffect(() => {
    try {
      const restored = safeRuntimeSnapshot(JSON.parse(localStorage.getItem(RUNTIME_STORAGE_KEY) || "null"));
      if (restored) setState((current) => ({ ...current, ...restored }));
    } catch (error) { void error; }
  }, []);
  useEffect(() => {
    if (!state.kind) return;
    persistRuntime(state);
  }, [persistRuntime, state]);
  useEffect(() => {
    const visibility = () => {
      const current = stateRef.current;
      if (!["recording", "paused"].includes(current.capture)) return;
      if (document.visibilityState === "hidden") {
        generalRecorderRef.current?.requestData();
        interviewRecorderRef.current?.requestData();
        patch({ notice: "화면을 벗어나면 Safari가 녹음을 중단할 수 있습니다. 다시 열어 실제 녹음 상태를 확인해주세요." });
        persistRuntime();
      } else {
        void requestWakeLock();
        const generalState = generalRecorderRef.current?.state;
        const interviewState = interviewRecorderRef.current?.state;
        if ((generalRecorderRef.current && generalState === "inactive") || (interviewRecorderRef.current && interviewState === "inactive")) interrupted("브라우저 복귀 후 마이크 입력이 중단된 것을 확인했습니다.");
      }
    };
    const pagehide = () => persistRuntime();
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("pagehide", pagehide);
    return () => { document.removeEventListener("visibilitychange", visibility); window.removeEventListener("pagehide", pagehide); };
  }, [interrupted, patch, persistRuntime, requestWakeLock]);
  useEffect(() => () => {
    if (timerRef.current !== null) window.clearInterval(timerRef.current);
    if (rotationRef.current !== null) window.clearInterval(rotationRef.current);
    persistRuntime();
    releaseTabLock();
  }, [persistRuntime, releaseTabLock]);

  const value = useMemo<VoiceSessionContextValue>(() => ({
    state, prepareGeneral, prepareInterview, start, pause, resume, stop, retryStorage,
    setViewedQuestion, beginQuestion, addHighlight, addFieldNote, addFollowUp, dismissResult,
  }), [addFieldNote, addFollowUp, addHighlight, beginQuestion, dismissResult, pause, prepareGeneral, prepareInterview, retryStorage, resume, setViewedQuestion, start, state, stop]);

  return <VoiceSessionContext.Provider value={value}>{children}</VoiceSessionContext.Provider>;
}

export function useVoiceSession() {
  const context = useContext(VoiceSessionContext);
  if (!context) throw new Error("VoiceSessionProvider 안에서 사용해야 합니다.");
  return context;
}
