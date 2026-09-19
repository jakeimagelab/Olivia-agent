"use client";

import { AlertCircle, CheckCircle2, LoaderCircle, Play } from "lucide-react";
import { useAnalysisExecution } from "./AnalysisExecutionContext";
import styles from "./AnalysisWorkspace.module.css";

function formatLastRun(value: string | null): string {
  if (!value) return "아직 실행 기록 없음";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "실행 기록 확인 불가";
  return new Intl.DateTimeFormat("ko-KR", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export default function AnalysisExecutionBar() {
  const execution = useAnalysisExecution();
  const running = execution.status === "running";
  const StatusIcon = running
    ? LoaderCircle
    : execution.status === "completed"
      ? CheckCircle2
      : execution.status === "failed"
        ? AlertCircle
        : Play;

  return (
    <section className={styles.executionBar} data-status={execution.status} aria-label="분석 실행 상태">
      <div className={styles.executionState}>
        <StatusIcon className={running ? styles.spin : undefined} size={16} aria-hidden="true" />
        <div>
          <strong>{execution.message}</strong>
          <span>마지막 실행: {formatLastRun(execution.lastCompletedAt)}</span>
        </div>
      </div>

      {running && execution.progress !== null ? (
        <div className={styles.progress} aria-label={`진행률 ${execution.progress}%`}>
          <i style={{ width: `${execution.progress}%` }} />
          <span>{execution.progress}%</span>
        </div>
      ) : null}

      <button
        type="button"
        onClick={execution.runRegisteredAction}
        disabled={!execution.actionAvailable || running}
      >
        {running ? <LoaderCircle className={styles.spin} size={14} /> : <Play size={14} />}
        {running ? "분석 중" : execution.actionLabel}
      </button>
    </section>
  );
}
