"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, LoaderCircle, Square, TriangleAlert } from "lucide-react";
import { cancelRemotePhotoSortJob } from "@/lib/photo-classifier/remotePhotoSort";
import type { RemoteJobProgress } from "@/lib/remote-jobs/progress";
import { useRemotePhotoJobStore } from "@/lib/store/useRemotePhotoJobStore";
import RemotePhotoProgressDetails from "@/components/photo-workspace/RemotePhotoProgressDetails";
import styles from "./OliviaDesktop.module.css";

type PhotoJob = {
  id: string;
  action: string;
  status: "QUEUED" | "RUNNING" | "COMPLETED" | "FAILED" | "CANCELED" | string;
  payload?: { source_relative_path?: string; source_folder?: string; work_relative_path?: string; only?: "all" | "연출" | "프로필" | "인테리어" } | null;
  progress?: RemoteJobProgress | null;
  message?: string | null;
  error?: string | null;
  cancel_requested_at?: string | null;
  completed_at?: string | null;
};

const PHOTO_ACTIONS = new Set(["PHOTO_SORT", "PHOTO_PREPARE_SOURCE", "PHOTO_STAGE_JPG", "PHOTO_CLASSIFY_WORK"]);
const STAGE_LABEL: Record<string, string> = {
  STAGING: "복사 준비 중",
  PREPARING: "JPG정리 중",
  COPYING: "Agentstation 복사 중",
  COPY_VERIFYING: "복사본 검증 중",
  SCANNING: "스캔 중",
  ANALYZING: "분석 중",
  SCENE_ANALYSIS: "장면 분석",
  FEATURE_EXTRACTION: "특징 추출",
  BOUNDARY_ANALYSIS: "경계 분석",
  ORGANIZING: "정리 중",
  FINAL_VERIFYING: "최종 검증 중",
  VERIFYING: "검증 중",
};

function operationLabel(job: PhotoJob): string {
  if (job.action === "PHOTO_PREPARE_SOURCE") return "JPG정리";
  if (job.action === "PHOTO_STAGE_JPG") return "JPG정리";
  if (job.payload?.only === "연출" || job.payload?.only === "프로필" || job.payload?.only === "인테리어") return `${job.payload.only}정리`;
  if (job.action === "PHOTO_SORT" || job.action === "PHOTO_CLASSIFY_WORK") return "분류";
  return "분류";
}

function folderName(job: PhotoJob): string {
  const raw = job.payload?.source_relative_path || job.payload?.source_folder || job.payload?.work_relative_path || "촬영 폴더";
  return raw.split("/").at(-1) || raw;
}

/** 데스크톱 상태 패널과 별개의 실행 표시줄. 실패는 사용자가 닫을 때까지 남긴다. */
export function PhotoTaskStatusBar() {
  const [jobs, setJobs] = useState<PhotoJob[]>([]);
  const [expandedJobId, setExpandedJobId] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    const read = async () => {
      try {
        const response = await fetch("/api/remote-jobs", { cache: "no-store" });
        const body = await response.json();
        if (!mounted || !response.ok || !body?.ok) return;
        const now = Date.now();
        setJobs((body.jobs as PhotoJob[] ?? []).filter((job) => {
          if (!PHOTO_ACTIONS.has(job.action)) return false;
          if (job.status === "FAILED" || job.status === "CANCELED") return true;
          if (job.status === "QUEUED" || job.status === "RUNNING") return true;
          return job.status === "COMPLETED" && job.completed_at
            ? now - new Date(job.completed_at).getTime() < 8_000
            : false;
        }));
      } catch {
        // 상태 표시는 본문을 막으면 안 된다. 다음 주기에 다시 확인한다.
      }
    };
    void read();
    const timer = window.setInterval(() => void read(), 5_000);
    return () => { mounted = false; window.clearInterval(timer); };
  }, []);

  const visible = useMemo(() => jobs.slice(0, 4), [jobs]);
  if (!visible.length) return null;

  return (
    <aside className={styles.photoTaskStatusBar} aria-live="polite" aria-label="사진 작업 진행 상태">
      {visible.map((job) => {
        const failed = job.status === "FAILED";
        const done = job.status === "COMPLETED";
        const canceled = job.status === "CANCELED";
        const cancelRequested = Boolean(job.cancel_requested_at);
        const stage = done ? "완료" : STAGE_LABEL[job.progress?.stage?.toUpperCase() ?? ""] || (job.status === "QUEUED" ? "대기 중" : "작업 중");
        const count = job.progress?.current !== undefined && job.progress?.total !== undefined
          ? `${job.progress.current.toLocaleString()} / ${job.progress.total.toLocaleString()}장`
          : null;
        const percent = job.progress?.current !== undefined && job.progress?.total && job.progress.total > 0
          ? Math.max(0, Math.min(100, Math.round((job.progress.current / job.progress.total) * 100)))
          : null;
        const sourceFolder = job.payload?.source_folder || job.payload?.source_relative_path || job.payload?.work_relative_path;
        const expanded = expandedJobId === job.id;
        const toggleDetail = () => setExpandedJobId((current) => current === job.id ? null : job.id);
        const cancel = async (event: React.MouseEvent<HTMLButtonElement>) => {
          event.stopPropagation();
          try {
            const updated = await cancelRemotePhotoSortJob(job.id);
            useRemotePhotoJobStore.getState().setTrackedJob(updated);
            setJobs((current) => current.map((item) => item.id === job.id ? { ...item, status: updated.status, message: updated.message, error: updated.error, cancel_requested_at: updated.cancelRequested ? new Date().toISOString() : null } : item));
          } catch (error) {
            setJobs((current) => current.map((item) => item.id === job.id ? { ...item, error: error instanceof Error ? error.message : "취소 요청을 보내지 못했습니다." } : item));
          }
        };
        return (
          <div key={job.id} className={styles.photoTaskStatusItem}>
            <div className={styles.photoTaskStatusRow} data-state={failed ? "failed" : canceled ? "cancelled" : done ? "done" : "running"} onClick={toggleDetail} role="button" tabIndex={0} aria-expanded={expanded} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") toggleDetail(); }}>
              {failed ? <TriangleAlert size={15} /> : canceled || done ? <Check size={15} /> : <LoaderCircle size={15} className={styles.photoTaskStatusSpin} />}
              <span><strong>{operationLabel(job)} · {folderName(job)}</strong><small>{failed ? (job.error || job.message || "작업에 실패했습니다.") : canceled ? (job.message || "작업을 취소했습니다. NAS 원본은 변경되지 않았습니다.") : `${stage}${count ? ` · ${count}` : ""}`}</small>{percent !== null ? <i className={styles.photoTaskGauge}><i style={{ width: `${percent}%` }} /></i> : null}</span>
              {!failed && !done && !canceled && !cancelRequested ? <button type="button" className={styles.photoTaskCancel} onClick={(event) => void cancel(event)}><Square size={10} fill="currentColor" /> 취소</button> : cancelRequested && !canceled ? <em className={styles.photoTaskCancelPending}>취소 요청됨</em> : null}
            </div>
            {expanded ? <div className={styles.photoTaskStatusDetail}><RemotePhotoProgressDetails job={{ status: job.status, progress: job.progress ?? null, message: job.message, error: job.error, cancelRequested }} sourceFolder={sourceFolder} /></div> : null}
          </div>
        );
      })}
    </aside>
  );
}
