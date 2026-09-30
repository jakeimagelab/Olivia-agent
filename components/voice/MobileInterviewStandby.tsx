"use client";

import { ArrowLeft, ChevronRight, Mic, Plus, RefreshCw } from "lucide-react";
import type { InterviewPreparation } from "@/lib/voice/interview/types";
import styles from "./MobileInterviewStandby.module.css";

function shortDate(value: string | null) {
  if (!value) return "날짜 미정";
  const [year, month, day] = value.split("-");
  return month && day ? `${Number(month)}/${Number(day)}` : year || value;
}

function statusLabel(status: InterviewPreparation["status"]) {
  if (status === "completed") return "완료";
  if (status === "draft") return "초안";
  if (status === "recording") return "녹음 중";
  if (status === "canceled") return "취소";
  return "준비 완료";
}

export default function MobileInterviewStandby({
  preparations,
  loading,
  error,
  onBack,
  onRefresh,
  onCreate,
  onOpen,
  onStart,
}: {
  preparations: InterviewPreparation[];
  loading: boolean;
  error: string;
  onBack: () => void;
  onRefresh: () => void;
  onCreate: () => void;
  onOpen: (preparation: InterviewPreparation) => void;
  onStart: (preparation: InterviewPreparation) => void;
}) {
  const ready = preparations.filter((preparation) => preparation.status === "ready");
  const recent = preparations.filter((preparation) => preparation.status !== "ready");

  return (
    <section className={styles.frame} aria-label="인터뷰 모드">
      <header className={styles.toolbar}>
        <button type="button" onClick={onBack}><ArrowLeft size={16} />일반 녹음</button>
        <h1>인터뷰 모드</h1>
        <button type="button" onClick={onRefresh} disabled={loading} aria-label="새로고침"><RefreshCw size={17} /></button>
      </header>

      <button type="button" className={styles.newInterview} onClick={onCreate}><Plus size={18} />새 인터뷰 준비</button>
      {error ? <p className={styles.error}>{error}</p> : null}

      <section className={styles.section}>
        <header><h2>준비된 인터뷰</h2><span>{ready.length}</span></header>
        {ready.length ? <div className={styles.readyList}>{ready.map((preparation) => (
          <article key={preparation.id}>
            <button type="button" className={styles.readyOpen} onClick={() => onOpen(preparation)}>
              <small>● 준비 완료</small>
              <strong>{preparation.hospital_name}</strong>
              <span>{preparation.interviewee_name} · {shortDate(preparation.interview_date)}</span>
              <em>질문 {preparation.selected_questions.length}개 <ChevronRight size={15} /></em>
            </button>
            <button type="button" className={styles.start} onClick={() => onStart(preparation)} aria-label={`${preparation.hospital_name} 인터뷰 시작`}><Mic size={16} /></button>
          </article>
        ))}</div> : <p className={styles.empty}>아직 준비된 인터뷰가 없습니다.</p>}
      </section>

      <section className={`${styles.section} ${styles.recent}`}>
        <header><h2>최근 인터뷰</h2></header>
        {recent.length ? recent.map((preparation) => (
          <button type="button" key={preparation.id} onClick={() => onOpen(preparation)}>
            <small data-status={preparation.status}>{statusLabel(preparation.status)}</small>
            <strong>{preparation.hospital_name || "병원명 미입력"}</strong>
            <span>{preparation.interviewee_name || "인터뷰 대상 미입력"}</span>
            <ChevronRight size={16} />
          </button>
        )) : <p className={styles.empty}>최근 인터뷰가 없습니다.</p>}
      </section>
    </section>
  );
}
