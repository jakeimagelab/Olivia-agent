"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { getSupabase } from "@/lib/supabase";
import type { RecorderQuality } from "@/lib/voice/browserRecorder";
import { baseAudioMimeType, VOICE_RECORDINGS_BUCKET, VOICE_UPLOAD_STORAGE_PREFIX } from "@/lib/voice/config";
import { inspectImportedAudio } from "@/lib/voice/importedAudio";
import {
  persistLocalCapture,
  listLocalCaptures,
  removeLocalCapture,
  persistLocalEvent,
  listLocalEvents,
  removeLocalEvent,
} from "@/lib/voice/recordingPersistence";
import type { InterviewFieldNote, InterviewFollowUp, InterviewHighlight, InterviewMarker, InterviewQuestionSnapshot } from "@/lib/voice/interview/types";
import type { SpeakerHint, VoiceStatus } from "@/lib/voice/types";
import { detectOliviaDevice } from "@/lib/device/detectDevice";

export type CaptureStatus = "idle" | "starting" | "tracking" | "recording" | "paused" | "interrupted" | "stopping" | "stopped" | "error";
export type StorageStatus = "none" | "awaiting_upload" | "local" | "uploading" | "stored" | "partial" | "failed";
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
  importAudioFile: (file: File) => Promise<void>;
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
    capture: capture === "recording" || capture === "tracking" || capture === "paused" || capture === "starting" ? "interrupted" : "stopped",
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
    notice: "이전 인터뷰 진행은 브라우저가 종료되어 중단되었습니다. 아이폰 원본을 추가하기 전 질문 진행 표시를 확인해주세요.",
  };
}

export function VoiceSessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<VoiceSessionState>(initialState);
  const stateRef = useRef(state);
  const timerRef = useRef<number | null>(null);
  const activeClockRef = useRef<number | null>(null);
  const accumulatedMsRef = useRef(0);
  const clientSequenceRef = useRef(0);
  const eventQueueRef = useRef(Promise.resolve());
  const importingRef = useRef(false);
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

  const interrupted = useCallback((message: string) => {
    const current = stateRef.current;
    if (!["tracking", "recording", "paused", "starting"].includes(current.capture)) return;
    stopClock(true);
    patch({ capture: "interrupted", storage: current.storage === "stored" ? "stored" : "partial", notice: message });
    persistRuntime({ ...stateRef.current, capture: "interrupted", notice: message });
    releaseTabLock();
  }, [patch, persistRuntime, releaseTabLock, stopClock]);

  const start = useCallback(async () => {
    const current = stateRef.current;
    if (current.kind !== "interview" || ["starting", "tracking", "recording", "paused", "stopping"].includes(current.capture)) return;
    if (!current.target) {
      patch({ error: "먼저 준비 완료된 인터뷰를 선택해주세요.", capture: "error" });
      return;
    }
    try {
      claimTabLock();
      accumulatedMsRef.current = 0;
      clientSequenceRef.current = 0;
      patch({ capture: "starting", storage: "none", analysis: "idle", recordingId: null, elapsedMilliseconds: 0, waveform: EMPTY_WAVEFORM, speakerHints: [], error: "", notice: "", resultId: null, activeQuestionId: null, events: EMPTY_EVENTS, quality: null });
      // Olivia is a question companion here, not the microphone. The iPhone
      // Voice Memos source is selected after the field interview is finished.
      const target = current.target;
      const response = await fetch("/api/voice/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "interview", preparationId: target.preparationId, versionId: target.versionId, mimeType: "audio/mp4", deviceType: detectOliviaDevice() }),
      });
      if (!response.ok) throw new Error(await readError(response, "인터뷰 진행 세션을 만들지 못했습니다."));
      const session = await response.json() as { id: string };
      patch({ recordingId: session.id, capture: "tracking", notice: "아이폰 음성 메모를 시작한 뒤 질문 진행을 기록하세요." });
      startClock();
      const first = target.questions.find((question) => question.id === stateRef.current.viewedQuestionId) ?? target.questions[0];
      if (first) appendEvent("question_started", first.id);
    } catch (error) {
      stopClock(true);
      releaseTabLock();
      patch({ capture: "error", error: error instanceof Error ? error.message : "인터뷰 진행을 시작하지 못했습니다." });
    }
  }, [appendEvent, claimTabLock, patch, releaseTabLock, startClock, stopClock]);

  const pause = useCallback(() => {
    const current = stateRef.current;
    if (current.capture !== "tracking") return;
    stopClock(true);
    patch({ capture: "paused", waveform: EMPTY_WAVEFORM });
  }, [patch, stopClock]);
  const resume = useCallback(() => {
    const current = stateRef.current;
    if (current.capture !== "paused") return;
    startClock();
    patch({ capture: "tracking", notice: "" });
  }, [patch, startClock]);

  const uploadGeneral = useCallback(async (recordingId: string, blob: Blob, mimeType: string) => {
    await persistLocalCapture({ recordingId, sequence: null, blob, startMilliseconds: 0, endMilliseconds: accumulatedMsRef.current, mimeType });
    patch({ storage: "local" });
    const pendingRaw = localStorage.getItem(`${VOICE_UPLOAD_STORAGE_PREFIX}${recordingId}`);
    const pending = pendingRaw ? JSON.parse(pendingRaw) as { path?: string; token?: string; mimeType?: string } : null;
    if (!pending?.path || !pending.token) throw new Error("녹음 업로드 정보를 찾지 못했습니다.");
    patch({ storage: "uploading" });
    await patchServerSession(recordingId, {
      status: "uploading",
      audioStatus: "uploading",
      durationSeconds: Math.round(accumulatedMsRef.current / 1_000),
      mimeType,
      liveSpeakerHints: stateRef.current.speakerHints,
    });
    const upload = await getSupabase().storage.from(VOICE_RECORDINGS_BUCKET).uploadToSignedUrl(pending.path, pending.token, blob, { contentType: baseAudioMimeType(pending.mimeType || mimeType) });
    if (upload.error) throw upload.error;
    await patchServerSession(recordingId, {
      status: "uploaded",
      audioStatus: "stored",
      durationSeconds: Math.round(accumulatedMsRef.current / 1_000),
      mimeType,
      liveSpeakerHints: stateRef.current.speakerHints,
    });
    await removeLocalCapture(recordingId, null);
    localStorage.removeItem(`${VOICE_UPLOAD_STORAGE_PREFIX}${recordingId}`);
    patch({ storage: "stored" });
    await beginAnalysis(recordingId);
  }, [beginAnalysis, patch, patchServerSession]);

  const uploadImportedInterview = useCallback(async ({
    recordingId,
    file,
    mimeType,
    durationSeconds,
    persist = true,
  }: {
    recordingId: string;
    file: Blob;
    mimeType: string;
    durationSeconds: number;
    persist?: boolean;
  }) => {
    if (persist) await persistLocalCapture({ recordingId, sequence: 0, blob: file, startMilliseconds: 0, endMilliseconds: durationSeconds * 1_000, mimeType });
    patch({ storage: "local", notice: "아이폰 원본을 안전하게 업로드하고 있습니다." });
    const prepared = await fetch(`/api/voice/sessions/${recordingId}/chunks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sequence: 0, startSeconds: 0, endSeconds: durationSeconds, mimeType, sizeBytes: file.size }),
    });
    if (!prepared.ok) throw new Error(await readError(prepared, "아이폰 원본 업로드를 준비하지 못했습니다."));
    const uploadInfo = await prepared.json() as { alreadyUploaded?: boolean; path?: string; uploadToken?: string; mimeType?: string };
    if (!uploadInfo.alreadyUploaded) {
      if (!uploadInfo.path || !uploadInfo.uploadToken) throw new Error("아이폰 원본 업로드 주소가 없습니다.");
      const upload = await getSupabase().storage.from(VOICE_RECORDINGS_BUCKET).uploadToSignedUrl(
        uploadInfo.path,
        uploadInfo.uploadToken,
        file,
        { contentType: baseAudioMimeType(uploadInfo.mimeType || mimeType) },
      );
      if (upload.error) throw upload.error;
      const confirmed = await fetch(`/api/voice/sessions/${recordingId}/chunks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sequence: 0, uploaded: true, sizeBytes: file.size }),
      });
      if (!confirmed.ok) throw new Error(await readError(confirmed, "업로드한 아이폰 원본을 저장소에서 확인하지 못했습니다."));
    }
    await eventQueueRef.current;
    const pendingEvents = await listLocalEvents(recordingId);
    if (pendingEvents.length) throw new Error("질문 진행 표시가 아직 기기에 남아 있습니다. 네트워크를 확인한 뒤 다시 시도해주세요.");
    const finalize = await fetch(`/api/voice/sessions/${recordingId}/finalize`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        durationSeconds,
        timelineDurationSeconds: accumulatedMsRef.current / 1_000,
        sourceMetadata: file instanceof File ? {
          originalFilename: file.name,
          originalSizeBytes: file.size,
        } : null,
      }),
    });
    if (!finalize.ok) throw new Error(await readError(finalize, "인터뷰 원본 저장을 확인하지 못했습니다."));
    await removeLocalCapture(recordingId, 0);
    patch({ capture: "stopped", storage: "stored", analysis: "queued", resultId: recordingId, notice: "아이폰 원본 저장이 완료되었습니다. AI 정리를 시작합니다." });
    await beginAnalysis(recordingId);
  }, [beginAnalysis, patch]);

  const importAudioFile = useCallback(async (file: File) => {
    const current = stateRef.current;
    if (importingRef.current) return;
    if (!current.kind || ["starting", "tracking", "recording", "paused", "stopping"].includes(current.capture)) {
      patch({ error: current.kind === "interview" ? "인터뷰 진행을 마친 뒤 아이폰 원본을 추가해주세요." : "현재 작업이 끝난 뒤 파일을 추가해주세요." });
      return;
    }
    importingRef.current = true;
    let hasRecoverableUpload = false;
    try {
      const imported = await inspectImportedAudio(file);
      accumulatedMsRef.current = imported.durationSeconds * 1_000;
      if (current.kind === "general") {
        patch({ capture: "starting", storage: "none", analysis: "idle", recordingId: null, elapsedMilliseconds: accumulatedMsRef.current, error: "", notice: "아이폰 원본을 준비하고 있습니다.", resultId: null, waveform: EMPTY_WAVEFORM, speakerHints: [], quality: null });
        const response = await fetch("/api/voice/sessions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: file.name.replace(/\.[^.]+$/, ""),
            mimeType: imported.mimeType,
            deviceType: detectOliviaDevice(),
            sourceMetadata: { originalFilename: file.name, originalSizeBytes: file.size, sourceDurationSeconds: imported.durationSeconds },
          }),
        });
        if (!response.ok) throw new Error(await readError(response, "아이폰 원본 세션을 만들지 못했습니다."));
        const session = await response.json() as { id: string; path?: string; uploadToken?: string; mimeType?: string };
        if (!session.path || !session.uploadToken) throw new Error("아이폰 원본 업로드 정보를 받지 못했습니다.");
        localStorage.setItem(`${VOICE_UPLOAD_STORAGE_PREFIX}${session.id}`, JSON.stringify({ path: session.path, token: session.uploadToken, mimeType: session.mimeType || imported.mimeType }));
        hasRecoverableUpload = true;
        patch({ capture: "stopped", recordingId: session.id, storage: "local", notice: "아이폰 원본을 업로드하고 있습니다." });
        await uploadGeneral(session.id, file, imported.mimeType);
      } else {
        if (!current.recordingId || current.capture !== "stopped") throw new Error("먼저 하단에서 인터뷰 진행을 마친 뒤 아이폰 원본을 추가해주세요.");
        hasRecoverableUpload = true;
        patch({ storage: "uploading", error: "", notice: "아이폰 원본을 업로드하고 있습니다." });
        await uploadImportedInterview({ recordingId: current.recordingId, file, mimeType: imported.mimeType, durationSeconds: imported.durationSeconds });
      }
    } catch (error) {
      patch({
        capture: hasRecoverableUpload ? "stopped" : current.capture,
        storage: hasRecoverableUpload ? "partial" : current.storage,
        error: error instanceof Error ? error.message : "아이폰 원본을 추가하지 못했습니다.",
        notice: hasRecoverableUpload ? "원본 파일은 기기에 보관되어 있습니다. 파일을 다시 선택하거나 업로드를 다시 시도해주세요." : "원본 파일은 변경하지 않았습니다. 다른 파일을 선택해주세요.",
      });
    } finally {
      importingRef.current = false;
    }
  }, [patch, uploadGeneral, uploadImportedInterview]);

  const stop = useCallback(async () => {
    const current = stateRef.current;
    if (!["tracking", "paused", "interrupted"].includes(current.capture)) return;
    const recordingId = current.recordingId;
    if (!recordingId) {
      interrupted("인터뷰 진행 세션을 확인하지 못했습니다.");
      return;
    }
    patch({ capture: "stopping", notice: "질문 진행을 마치고 있습니다." });
    stopClock(true);
    try {
      await eventQueueRef.current;
      const pendingEvents = await listLocalEvents(recordingId);
      if (pendingEvents.length) throw new Error("질문 진행 표시가 아직 기기에 남아 있습니다. 네트워크를 확인한 뒤 다시 시도해주세요.");
      patch({ capture: "stopped", storage: "awaiting_upload", notice: "아이폰 음성 메모 원본을 선택해 업로드해주세요." });
      releaseTabLock();
    } catch (error) {
      patch({ capture: "stopped", storage: "partial", error: error instanceof Error ? error.message : "질문 진행 표시 저장을 확인하지 못했습니다.", notice: "질문 진행 표시는 기기에 보존되어 있습니다. 업로드를 다시 시도하세요." });
      releaseTabLock();
    }
  }, [interrupted, patch, releaseTabLock, stopClock]);

  const retryStorage = useCallback(async () => {
    const current = stateRef.current;
    if (!current.recordingId) return;
    patch({ error: "", notice: "기기에 저장한 녹음 구간을 다시 업로드하고 있습니다." });
    try {
      const captures = await listLocalCaptures(current.recordingId);
      const events = await listLocalEvents(current.recordingId);
      if (!captures.length && !events.length) throw new Error("기기에 다시 올릴 녹음 구간이나 질문 표시가 없습니다.");
      if (current.kind === "interview") {
        for (const event of events) {
          await uploadEvent(current.recordingId, event);
          await removeLocalEvent(current.recordingId, event.eventId);
        }
        const source = captures.find((capture) => capture.sequence === 0);
        if (source) {
          await uploadImportedInterview({
            recordingId: current.recordingId,
            file: source.blob,
            mimeType: source.mimeType || source.blob.type || "audio/mp4",
            durationSeconds: Math.max(0, (source.endMilliseconds ?? 0) - (source.startMilliseconds ?? 0)) / 1_000,
            persist: false,
          });
          return;
        }
        patch({ storage: "awaiting_upload", notice: "질문 진행 표시는 저장되었습니다. 아이폰 음성 메모 원본을 추가해주세요." });
        return;
      }
      for (const capture of captures.sort((left, right) => (left.sequence ?? -1) - (right.sequence ?? -1))) {
        if (capture.sequence === null) await uploadGeneral(current.recordingId, capture.blob, capture.blob.type || "audio/mp4");
      }
      for (const event of events) {
        await uploadEvent(current.recordingId, event);
        await removeLocalEvent(current.recordingId, event.eventId);
      }
      patch({ storage: "stored", notice: "기기에 저장한 음성 원본을 업로드했습니다." });
    } catch (error) {
      patch({ storage: "partial", error: error instanceof Error ? error.message : "업로드를 다시 시도하지 못했습니다." });
    }
  }, [patch, uploadEvent, uploadGeneral, uploadImportedInterview]);

  const prepareGeneral = useCallback(() => {
    const current = stateRef.current;
    // An interview can be finished on screen while its original iPhone file
    // is still awaiting selection, local persistence, or upload. Do not let
    // entering the general-recording tab silently turn that pending interview
    // into a different session.
    if (
      ["tracking", "recording", "paused", "starting", "stopping"].includes(current.capture)
      || ["awaiting_upload", "local", "uploading", "partial", "failed"].includes(current.storage)
    ) return;
    patch({ kind: "general", capture: current.capture === "interrupted" ? "interrupted" : "idle", target: null, viewedQuestionId: null, activeQuestionId: null, error: "", notice: current.capture === "interrupted" ? current.notice : "" });
  }, [patch]);
  const prepareInterview = useCallback((target: PreparedInterview) => {
    const current = stateRef.current;
    if (
      ["tracking", "recording", "paused", "starting", "stopping"].includes(current.capture)
      || ["awaiting_upload", "local", "uploading", "partial", "failed"].includes(current.storage)
    ) {
      if (current.target?.preparationId !== target.preparationId) patch({ notice: "진행 중인 인터뷰를 다른 인터뷰로 바꿀 수 없습니다. 먼저 종료하거나 진행 중인 화면으로 이동하세요." });
      return;
    }
    patch({ kind: "interview", target, capture: current.capture === "interrupted" ? "interrupted" : "idle", viewedQuestionId: target.questions[0]?.id || null, activeQuestionId: null, error: "", notice: current.capture === "interrupted" ? current.notice : "" });
  }, [patch]);
  const setViewedQuestion = useCallback((questionId: string) => {
    if (stateRef.current.target?.questions.some((question) => question.id === questionId)) patch({ viewedQuestionId: questionId });
  }, [patch]);
  const beginQuestion = useCallback((questionId: string) => {
    const current = stateRef.current;
    if (current.capture === "paused") { patch({ notice: "일시정지 중에는 질문 진행을 시작할 수 없습니다. 인터뷰 진행을 계속한 뒤 선택해주세요." }); return; }
    if (current.capture !== "tracking") { patch({ notice: "하단에서 인터뷰 진행을 시작한 뒤에 질문 진행 표시를 남길 수 있습니다." }); return; }
    if (!current.target?.questions.some((question) => question.id === questionId)) return;
    appendEvent("question_started", questionId);
  }, [appendEvent, patch]);
  const addHighlight = useCallback(() => {
    const questionId = stateRef.current.activeQuestionId;
    if (questionId && stateRef.current.capture === "tracking") appendEvent("highlight", questionId);
  }, [appendEvent]);
  const addFieldNote = useCallback((text: string) => {
    const questionId = stateRef.current.activeQuestionId;
    if (questionId && text.trim() && stateRef.current.capture === "tracking") appendEvent("field_note", questionId, { text: text.trim() });
  }, [appendEvent]);
  const addFollowUp = useCallback((text: string) => {
    const questionId = stateRef.current.activeQuestionId;
    if (questionId && text.trim() && stateRef.current.capture === "tracking") appendEvent("follow_up", questionId, { text: text.trim() });
  }, [appendEvent]);
  const dismissResult = useCallback(() => {
    const current = stateRef.current;
    if (["tracking", "recording", "paused", "starting", "stopping"].includes(current.capture)) return;
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
      if (!["tracking", "paused"].includes(current.capture)) return;
      if (document.visibilityState === "hidden") {
        patch({ notice: "아이폰 원본 녹음은 계속됩니다. Olivia 질문 진행 시간은 화면 복귀 후 확인해주세요." });
        persistRuntime();
      }
    };
    const pagehide = () => persistRuntime();
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("pagehide", pagehide);
    return () => { document.removeEventListener("visibilitychange", visibility); window.removeEventListener("pagehide", pagehide); };
  }, [patch, persistRuntime]);
  useEffect(() => () => {
    if (timerRef.current !== null) window.clearInterval(timerRef.current);
    persistRuntime();
    releaseTabLock();
  }, [persistRuntime, releaseTabLock]);

  const value = useMemo<VoiceSessionContextValue>(() => ({
    state, prepareGeneral, prepareInterview, importAudioFile, start, pause, resume, stop, retryStorage,
    setViewedQuestion, beginQuestion, addHighlight, addFieldNote, addFollowUp, dismissResult,
  }), [addFieldNote, addFollowUp, addHighlight, beginQuestion, dismissResult, importAudioFile, pause, prepareGeneral, prepareInterview, retryStorage, resume, setViewedQuestion, start, state, stop]);

  return <VoiceSessionContext.Provider value={value}>{children}</VoiceSessionContext.Provider>;
}

export function useVoiceSession() {
  const context = useContext(VoiceSessionContext);
  if (!context) throw new Error("VoiceSessionProvider 안에서 사용해야 합니다.");
  return context;
}
