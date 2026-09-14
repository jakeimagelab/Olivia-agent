"use client";

import { Check, Clock3, HardDrive, X } from "lucide-react";
import { useState } from "react";
import { usePhotoProjectNotifications } from "./PhotoProjectNotificationProvider";
import styles from "./PhotoProjectNotification.module.css";

function formatBytes(bytes: number): string {
  if (!bytes) return "0B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** index).toFixed(index > 1 ? 1 : 0)}${units[index]}`;
}

export default function PhotoProjectNotification() {
  const { projects, events, lastAction, approve, defer, retry } = usePhotoProjectNotifications();
  const [busy, setBusy] = useState<"approve" | "defer" | "retry" | null>(null);
  const [dismissedReview, setDismissedReview] = useState<string[]>([]);
  const pending = projects.filter((project) => ["READY", "COPY_QUEUED", "COPYING", "COPY_VERIFYING", "COPY_FAILED"].includes(project.status) || (project.status === "REVIEW_REQUIRED" && !dismissedReview.includes(project.id)));
  const project = pending[0];
  const event = project ? events.find((candidate) => candidate.project_id === project.id && candidate.status === "OPEN") : undefined;

  const runAction = async (action: "approve" | "defer" | "retry") => {
    if (!project || busy) return;
    setBusy(action);
    try {
      if (action === "approve") await approve(project.id);
      else if (action === "defer") await defer(project.id);
      else await retry(project.id);
    } catch {
      // Provider refresh will expose the server state; keep the card available on transient errors.
    } finally {
      setBusy(null);
    }
  };

  if (lastAction) {
    return <div className={styles.statusToast} role="status"><Check size={16} /><span>{lastAction.project.project_name} · {lastAction.action === "APPROVED" ? "분류 승인됨 · 작업 대기" : "나중에 처리하도록 보류됨"}</span></div>;
  }
  if (!project) {
    const completed = projects.find((candidate) => candidate.status === "COPY_COMPLETED" && Date.now() - new Date(candidate.updated_at).getTime() < 10 * 60_000);
    return completed ? <div className={styles.statusToast} role="status"><Check size={16} /><span>{completed.project_name} · JPG 복사가 완료되었습니다.</span></div> : null;
  }

  if (project.status === "COPY_QUEUED" || project.status === "COPYING" || project.status === "COPY_VERIFYING") {
    const progress = project.copy_progress || {};
    const current = typeof progress.current === "number" ? progress.current : project.copied_jpg_count;
    const total = typeof progress.total === "number" ? progress.total : project.jpg_count;
    const copiedBytes = typeof progress.copiedBytes === "number" ? progress.copiedBytes : project.copied_jpg_bytes;
    const totalBytes = typeof progress.totalBytes === "number" ? progress.totalBytes : project.jpg_bytes;
    const percent = total > 0 ? Math.min(100, Math.round((current / total) * 100)) : 0;
    const title = project.status === "COPY_QUEUED" ? "복사 준비 중" : project.status === "COPY_VERIFYING" ? "복사 결과를 확인하고 있습니다." : "Mac Studio에서 JPG를 작업 SSD로 복사하고 있습니다.";
    return <aside className={styles.card} role="status"><div className={styles.icon}><HardDrive size={20} /></div><div className={styles.content}><p className={styles.eyebrow}>사진 작업 상태</p><h2>{project.project_name} · {title}</h2><p className={styles.detail}>{current.toLocaleString("ko-KR")} / {total.toLocaleString("ko-KR")}장 · {percent}%{totalBytes > 0 ? ` · ${formatBytes(copiedBytes)} / ${formatBytes(totalBytes)}` : ""}</p><div className={styles.progressTrack}><span style={{ width: `${percent}%` }} /></div><p className={styles.progressMessage}>{typeof progress.message === "string" ? progress.message : "Mac Studio 작업 상태를 확인하고 있습니다."}</p></div></aside>;
  }

  if (project.status === "COPY_FAILED") {
    return <aside className={styles.card} role="alert"><div className={styles.icon}><HardDrive size={20} /></div><div className={styles.content}><p className={styles.eyebrow}>복사 확인 필요</p><h2>{project.project_name} JPG 복사 중 문제가 발생했습니다.</h2><p className={styles.detail}>{project.copy_error || "원본은 변경되지 않았습니다."}</p><button className={styles.primaryButton} type="button" disabled={Boolean(busy)} onClick={() => void runAction("retry")}>{busy === "retry" ? "재요청 중..." : "다시 시도"}</button></div></aside>;
  }

  if (project.status === "REVIEW_REQUIRED") {
    return (
      <aside className={styles.card} role="status">
        <button className={styles.close} type="button" aria-label="알림 닫기" onClick={() => setDismissedReview((current) => [...current, project.id])}><X size={17} /></button>
        <div className={styles.icon}><HardDrive size={20} /></div>
        <div className={styles.content}>
          <p className={styles.eyebrow}>촬영 파일 확인 필요</p>
          <h2>{project.project_name} 파일을 확인해야 합니다.</h2>
          <p className={styles.detail}>{event?.message || "동일한 JPG 파일이 이미 존재합니다."}</p>
          <button className={styles.secondaryButton} type="button" onClick={() => setDismissedReview((current) => [...current, project.id])}>확인</button>
        </div>
        {pending.length > 1 ? <span className={styles.queue}>{pending.length}건</span> : null}
      </aside>
    );
  }

  return (
    <aside className={styles.card} role="status">
      <button className={styles.close} type="button" aria-label="알림 닫기" onClick={() => void runAction("defer")}><X size={17} /></button>
      <div className={styles.icon}><HardDrive size={20} /></div>
      <div className={styles.content}>
        <p className={styles.eyebrow}>새 촬영 파일</p>
        <h2>{project.project_name} 촬영 파일이 확인되었습니다.</h2>
        <p className={styles.detail}>JPG {project.jpg_count.toLocaleString("ko-KR")}장 · {formatBytes(project.jpg_bytes)}</p>
        <div className={styles.actions}>
          <button className={styles.secondaryButton} type="button" disabled={Boolean(busy)} onClick={() => void runAction("defer")}><Clock3 size={15} /> 나중에</button>
          <button className={styles.primaryButton} type="button" disabled={Boolean(busy)} onClick={() => void runAction("approve")}>{busy === "approve" ? "처리 중..." : "자동 분류 시작"}</button>
        </div>
      </div>
      {pending.length > 1 ? <span className={styles.queue}>{pending.length}건</span> : null}
    </aside>
  );
}
