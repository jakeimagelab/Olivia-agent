import { photoQualityJobProgress } from "@/lib/photo-quality/public";
import styles from "./PhotoQualityJobProgress.module.css";

export default function PhotoQualityJobProgressView({
  job,
  tone = "dark",
}: {
  job: Record<string, unknown> | null | undefined;
  tone?: "dark" | "light";
}) {
  const progress = photoQualityJobProgress(job);
  if (!progress) return null;

  return <section className={styles.progress} data-tone={tone} data-status={progress.status} aria-label="AI 품질 검사 진행 상황">
    <header><strong>{progress.label}</strong><b>{progress.percent}%</b></header>
    <div
      className={styles.track}
      role="progressbar"
      aria-label={`${progress.processed} / ${progress.total}장 처리`}
      aria-valuemin={0}
      aria-valuemax={progress.total || 1}
      aria-valuenow={progress.processed}
    ><span style={{ width: `${progress.percent}%` }} /></div>
    <div className={styles.counts}>
      <span>처리 <b>{progress.processed.toLocaleString("ko-KR")}/{progress.total.toLocaleString("ko-KR")}</b></span>
      <span>완료 <b>{progress.completed.toLocaleString("ko-KR")}</b></span>
      <span>실패 <b>{progress.failed.toLocaleString("ko-KR")}</b></span>
      <span>남음 <b>{progress.pending.toLocaleString("ko-KR")}</b></span>
    </div>
  </section>;
}
