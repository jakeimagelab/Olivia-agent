"use client";

import { LoaderCircle, Pause, Play, RefreshCw, RotateCcw, Upload, X } from "lucide-react";
import { useMemo, useState } from "react";
import { usePersonSelectUploadManager } from "./PersonSelectUploadManager";
import styles from "./PersonSelectUploadStatus.module.css";

function statusLabel(status: string) {
  if (status === "completed") return "완료";
  if (status === "partial_failed") return "일부 실패";
  if (status === "failed") return "실패";
  if (status === "paused") return "일시정지";
  if (status === "canceled") return "취소";
  if (status === "queued") return "대기 중";
  return "업로드 중";
}

export function PersonSelectUploadStatus() {
  const manager = usePersonSelectUploadManager();
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const visible = useMemo(() => manager.jobs.filter((job) => {
    if (!["completed", "canceled"].includes(job.status)) return true;
    if (!job.completed_at) return false;
    return Date.now() - new Date(job.completed_at).getTime() < 15_000;
  }).slice(0, 8), [manager.jobs]);
  if (!visible.length) return null;
  const primary = visible[0];
  const percent = primary.total_count ? Math.round(primary.success_count / primary.total_count * 100) : 0;
  const run = async (action: () => Promise<void>) => {
    setMessage("");
    try { await action(); }
    catch (error) { setMessage(error instanceof Error ? error.message : "요청을 처리하지 못했습니다."); }
  };
  return <aside className={styles.status} aria-live="polite" aria-label="사진선택 업로드 상태">
    {open ? <section className={styles.panel}>
      <header className={styles.panelHeader}><strong>사진 업로드</strong><button type="button" aria-label="닫기" onClick={() => setOpen(false)}><X size={17} /></button></header>
      {visible.map((job) => {
        const jobPercent = job.total_count ? Math.round(job.success_count / job.total_count * 100) : 0;
        return <article key={job.id} className={styles.job}>
          <div className={styles.jobTitle}><strong>{job.project_title}</strong><span>{statusLabel(job.status)} · {jobPercent}%</span></div>
          <div className={styles.jobMeta}>완료 {job.success_count.toLocaleString()} · 실패 {job.failed_count.toLocaleString()} · 남음 {job.pending_count.toLocaleString()}</div>
          <span className={styles.bar}><i style={{ width: `${jobPercent}%` }} /></span>
          {job.needs_file_reselection && !["completed", "canceled"].includes(job.status) ? <div className={styles.warning}>브라우저가 원본 파일 권한을 잃었습니다. 프로젝트에서 같은 폴더를 다시 선택하면 완료된 사진을 제외하고 이어집니다.</div> : null}
          <div className={styles.jobActions}>
            {job.status === "uploading" || job.status === "queued" ? <button type="button" onClick={() => void run(() => manager.pause(job.id))}><Pause size={12} /> 일시정지</button> : null}
            {job.status === "paused" ? <button type="button" onClick={() => void run(() => manager.resume(job.id))}><Play size={12} /> 계속</button> : null}
            {job.failed_count > 0 ? <button type="button" onClick={() => void run(() => manager.retryFailed(job.id))}><RotateCcw size={12} /> 실패 재시도</button> : null}
            {!["completed", "canceled"].includes(job.status) ? <button type="button" onClick={() => void run(() => manager.cancel(job.id))}>취소</button> : null}
          </div>
        </article>;
      })}
      {message ? <p className={styles.warning}>{message}</p> : null}
    </section> : null}
    <button type="button" className={styles.summary} onClick={() => setOpen((value) => !value)} aria-expanded={open}>
      {primary.status === "uploading" || primary.status === "queued" ? <LoaderCircle size={18} className={styles.spin} /> : primary.status === "partial_failed" || primary.status === "failed" ? <RefreshCw size={18} /> : <Upload size={18} />}
      <span><strong>{primary.project_title}</strong><small>{primary.success_count.toLocaleString()} / {primary.total_count.toLocaleString()}장 · {statusLabel(primary.status)}</small></span>
      <em className={styles.percent}>{percent}%</em>
      <span className={styles.bar}><i style={{ width: `${percent}%` }} /></span>
    </button>
  </aside>;
}
