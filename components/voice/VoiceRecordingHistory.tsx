"use client";

import Link from "next/link";
import { RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import type { VoiceStatus } from "@/lib/voice/types";
import styles from "./VoiceRecordingHistory.module.css";

type HistoryItem = {
  id: string;
  title: string | null;
  status: VoiceStatus;
  duration_seconds: number;
  summary: string | null;
  recorded_at: string;
  processed_at: string | null;
};

function formatDuration(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function formatDate(value: string): string {
  return new Date(value).toLocaleString("ko-KR", { month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function statusLabel(status: VoiceStatus): { text: string; tone: "done" | "progress" | "error" } {
  if (status === "completed") return { text: "정리 완료", tone: "done" };
  if (status === "transcribed") return { text: "전사 완료", tone: "progress" };
  if (status === "error") return { text: "확인 필요", tone: "error" };
  if (status === "recording") return { text: "녹음 중", tone: "progress" };
  return { text: "처리 중", tone: "progress" };
}

// docs/tablet-ipad-home-memo-voice-spec.md §7-1 — "목록 화면 신설(최우선)". OliviaRecorder(녹음)와
// VoiceRecordingDetail(상세)은 그대로 두고, 그 사이를 잇는 목록만 새로 추가한다.
export default function VoiceRecordingHistory() {
  const [items, setItems] = useState<HistoryItem[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/voice/sessions", { cache: "no-store" });
      const body = await response.json().catch(() => ({})) as { recordings?: HistoryItem[]; error?: string };
      if (!response.ok) throw new Error(body.error || "음성 기록 목록을 불러오지 못했습니다.");
      setItems(body.recordings ?? []);
      setError(false);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  return (
    <section className={styles.root} aria-label="최근 음성 기록">
      <div className={styles.header}>
        <h2>최근 음성 기록</h2>
        <button type="button" className={styles.refresh} onClick={() => void load()} aria-label="새로고침" disabled={loading}>
          <RefreshCw size={13} className={loading ? styles.spin : undefined} />
        </button>
      </div>
      {error && !items ? (
        <div className={styles.error}>
          <span>목록을 불러오지 못했어요</span>
          <br />
          <button type="button" onClick={() => void load()}>다시 시도</button>
        </div>
      ) : !items ? (
        <p className={styles.loading}>불러오는 중...</p>
      ) : items.length === 0 ? (
        <p className={styles.empty}>아직 저장된 음성 기록이 없어요.</p>
      ) : (
        <ul className={styles.list}>
          {items.map((item) => {
            const status = statusLabel(item.status);
            return (
              <li key={item.id}>
                <Link href={`/voice-recorder/${item.id}`}>
                  <span className={styles.itemBody}>
                    <span className={styles.itemTitle}>{item.title || item.summary || "제목 없는 기록"}</span>
                    <span className={styles.itemMeta}>{formatDate(item.recorded_at)}</span>
                  </span>
                  <span className={styles.duration}>{formatDuration(item.duration_seconds)}</span>
                  <span className={`${styles.status} ${status.tone === "done" ? styles.statusDone : status.tone === "error" ? styles.statusError : styles.statusProgress}`}>
                    {status.text}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
