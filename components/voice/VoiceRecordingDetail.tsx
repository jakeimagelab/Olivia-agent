"use client";

import Link from "next/link";
import { AlertCircle, ArrowLeft, Check, CheckSquare, Clock3, ListChecks, Pencil, RefreshCw, Sparkles, UserRound } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { defaultSpeakerName } from "@/lib/voice/processing";
import type { VoiceRecording, VoiceStatus } from "@/lib/voice/types";
import styles from "./VoiceRecordingDetail.module.css";

function formatDuration(totalSeconds: number) {
  const hours = Math.floor(totalSeconds / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;
  return hours > 0 ? `${hours}시간 ${minutes}분 ${seconds}초` : `${minutes}분 ${seconds}초`;
}

function formatSegmentTime(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  return `${String(minutes).padStart(2, "0")}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
}

function statusCopy(status: VoiceStatus) {
  if (status === "recording") return "녹음이 아직 끝나지 않았습니다.";
  if (status === "uploading") return "원본 음성을 저장하고 있어요.";
  if (status === "uploaded" || status === "diarizing") return "화자를 구분하고 있어요.";
  if (status === "summarizing") return "대화 내용을 정리하고 있어요.";
  if (status === "transcribed") return "화자별 전사는 완료됐고, AI 정리는 대기 중이에요.";
  if (status === "error") return "처리 과정에서 확인이 필요해요.";
  return "정리가 완료됐어요.";
}

export default function VoiceRecordingDetail({ id }: { id: string }) {
  const [recording, setRecording] = useState<VoiceRecording | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editingSpeaker, setEditingSpeaker] = useState<string | null>(null);
  const [speakerName, setSpeakerName] = useState("");
  const [savingSpeaker, setSavingSpeaker] = useState(false);
  const [retrying, setRetrying] = useState(false);

  const load = useCallback(async () => {
    try {
      const response = await fetch(`/api/voice/sessions/${id}`, { cache: "no-store" });
      if (!response.ok) {
        const body = await response.json().catch(() => ({})) as { error?: string };
        throw new Error(body.error || "기록을 불러오지 못했습니다.");
      }
      setRecording(await response.json() as VoiceRecording);
      setError("");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "기록을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { void load(); }, [load]);

  const pollingStatus = recording?.status;

  useEffect(() => {
    if (!pollingStatus || !["uploading", "uploaded", "diarizing", "summarizing"].includes(pollingStatus)) return;
    const timer = window.setInterval(() => void load(), 1_800);
    return () => window.clearInterval(timer);
  }, [load, pollingStatus]);

  const speakers = useMemo(() => (
    Array.from(new Set(recording?.transcript_segments?.map((segment) => segment.speaker) ?? []))
  ), [recording?.transcript_segments]);

  const saveSpeaker = useCallback(async () => {
    if (!recording || !editingSpeaker || !speakerName.trim()) return;
    setSavingSpeaker(true);
    try {
      const response = await fetch(`/api/voice/sessions/${id}/speaker`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ speaker: editingSpeaker, name: speakerName.trim() }),
      });
      const body = await response.json() as { error?: string; speaker_names?: Record<string, string> };
      if (!response.ok || !body.speaker_names) throw new Error(body.error || "화자 이름을 저장하지 못했습니다.");
      setRecording({ ...recording, speaker_names: body.speaker_names });
      setEditingSpeaker(null);
      setSpeakerName("");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "화자 이름을 저장하지 못했습니다.");
    } finally {
      setSavingSpeaker(false);
    }
  }, [editingSpeaker, id, recording, speakerName]);

  const retrySummary = useCallback(async () => {
    setRetrying(true);
    setError("");
    try {
      const response = await fetch(`/api/voice/sessions/${id}/process`, { method: "POST" });
      const body = await response.json() as { error?: string };
      if (!response.ok && response.status !== 409) throw new Error(body.error || "다시 정리하지 못했습니다.");
      await load();
    } catch (retryError) {
      setError(retryError instanceof Error ? retryError.message : "다시 정리하지 못했습니다.");
    } finally {
      setRetrying(false);
    }
  }, [id, load]);

  if (loading) {
    return <main className={styles.loading}><span /><p>음성 기록을 불러오고 있어요.</p></main>;
  }

  if (!recording) {
    return (
      <main className={styles.loading}>
        <AlertCircle size={36} />
        <p>{error || "기록을 찾을 수 없습니다."}</p>
        <Link href="/voice-recorder">음성 기록으로 돌아가기</Link>
      </main>
    );
  }

  const speakerNames = recording.speaker_names || {};
  const processing = ["recording", "uploading", "uploaded", "diarizing", "summarizing"].includes(recording.status);

  return (
    <main className={styles.root}>
      <div className={styles.container}>
        <header className={styles.header}>
          <Link href="/voice-recorder" aria-label="음성 기록으로 돌아가기"><ArrowLeft size={20} /></Link>
          <div>
            <p>OLIVIA VOICE RECORD</p>
            <h1>{recording.title || "음성 기록"}</h1>
            <span>
              {new Date(recording.recorded_at).toLocaleString("ko-KR", { dateStyle: "long", timeStyle: "short" })}
              <i />
              {formatDuration(recording.duration_seconds || 0)}
            </span>
          </div>
          <div className={`${styles.statusBadge} ${recording.status === "completed" ? styles.statusComplete : ""}`}>
            {recording.status === "completed" ? <Check size={15} /> : <Clock3 size={15} />}
            {recording.status === "completed" ? "정리 완료" : recording.status === "transcribed" ? "전사 완료" : "처리 중"}
          </div>
        </header>

        {error ? <div className={styles.errorBanner}><AlertCircle size={17} /><span>{error}</span><button type="button" onClick={() => setError("")}>닫기</button></div> : null}

        <section className={styles.audioCard}>
          <div><span><Clock3 size={18} /></span><div><strong>원본 음성</strong><small>AI 결과와 별도로 보존됩니다.</small></div></div>
          {recording.audio_url ? <audio controls preload="metadata" src={recording.audio_url} /> : <span>원본 음성을 준비하고 있어요.</span>}
        </section>

        {processing || recording.status === "error" || recording.status === "transcribed" ? (
          <section className={styles.progressCard}>
            {processing ? <span className={styles.spinner} /> : <AlertCircle size={24} />}
            <div><strong>{statusCopy(recording.status)}</strong><small>{recording.error_message || "원본과 처리된 데이터는 단계별로 저장됩니다."}</small></div>
            {(recording.status === "transcribed" || (recording.status === "error" && recording.transcript_text)) ? (
              <button type="button" disabled={retrying} onClick={() => void retrySummary()}><RefreshCw size={16} /> {retrying ? "다시 정리 중" : "AI 정리 다시 시도"}</button>
            ) : null}
          </section>
        ) : null}

        {recording.summary ? (
          <section className={`${styles.section} ${styles.summary}`}>
            <header><span><Sparkles size={19} /></span><div><small>AI SUMMARY</small><h2>AI 요약</h2></div></header>
            <p>{recording.summary}</p>
          </section>
        ) : null}

        <div className={styles.insightGrid}>
          {recording.key_points?.length > 0 ? (
            <section className={styles.section}>
              <header><span><ListChecks size={19} /></span><div><small>KEY POINTS</small><h2>핵심 내용</h2></div></header>
              <ul>{recording.key_points.map((item, index) => <li key={`${item}-${index}`}><i>{index + 1}</i><span>{item}</span></li>)}</ul>
            </section>
          ) : null}

          {recording.action_items?.length > 0 ? (
            <section className={`${styles.section} ${styles.actions}`}>
              <header><span><CheckSquare size={19} /></span><div><small>ACTION CANDIDATES</small><h2>발견된 할 일</h2></div></header>
              <p>아직 실제 To-do에는 등록되지 않았습니다.</p>
              <ul>{recording.action_items.map((item, index) => <li key={`${item}-${index}`}><i aria-hidden="true" /><span>{item}</span></li>)}</ul>
            </section>
          ) : null}
        </div>

        {speakers.length > 0 ? (
          <section className={styles.speakerSection}>
            <header><div><small>SPEAKERS</small><h2>화자 이름</h2></div><span>이름을 바꾸면 이 기록의 모든 대화에 함께 적용됩니다.</span></header>
            <div className={styles.speakerList}>
              {speakers.map((speaker) => {
                const displayName = speakerNames[speaker] || defaultSpeakerName(speaker, speakers);
                const editing = editingSpeaker === speaker;
                return (
                  <div key={speaker} className={styles.speakerRow}>
                    <span><UserRound size={18} /></span>
                    {editing ? (
                      <form onSubmit={(event) => { event.preventDefault(); void saveSpeaker(); }}>
                        <input autoFocus value={speakerName} maxLength={80} onChange={(event) => setSpeakerName(event.target.value)} aria-label={`${displayName} 새 이름`} />
                        <button type="submit" disabled={savingSpeaker || !speakerName.trim()}>저장</button>
                        <button type="button" onClick={() => setEditingSpeaker(null)}>취소</button>
                      </form>
                    ) : (
                      <><strong>{displayName}</strong><button type="button" onClick={() => { setEditingSpeaker(speaker); setSpeakerName(displayName); }}><Pencil size={14} /> 이름 변경</button></>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        ) : null}

        <section className={styles.transcriptSection}>
          <header><div><small>FULL TRANSCRIPT</small><h2>전체 대화</h2></div><span>{recording.transcript_segments?.length ?? 0}개 구간</span></header>
          <div className={styles.transcriptList}>
            {recording.transcript_segments?.length > 0 ? recording.transcript_segments.map((segment, index) => {
              const name = speakerNames[segment.speaker] || defaultSpeakerName(segment.speaker, speakers);
              return (
                <article key={`${segment.speaker}-${segment.start}-${index}`}>
                  <div><span><UserRound size={16} /></span><strong>{name}</strong><time>{formatSegmentTime(segment.start)}–{formatSegmentTime(segment.end)}</time></div>
                  <p>{segment.text}</p>
                </article>
              );
            }) : <p className={styles.emptyTranscript}>{processing ? "전사가 끝나면 화자별 대화가 여기에 표시됩니다." : "인식된 대화가 없습니다."}</p>}
          </div>
        </section>
      </div>
    </main>
  );
}
