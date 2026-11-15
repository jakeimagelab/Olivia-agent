"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, LoaderCircle, Square, TriangleAlert } from "lucide-react";
import { cancelRemotePhotoSortJob } from "@/lib/photo-classifier/remotePhotoSort";
import { useRemotePhotoJobStore } from "@/lib/store/useRemotePhotoJobStore";
import RemotePhotoProgressDetails from "@/components/photo-workspace/RemotePhotoProgressDetails";
import { ModalCloseButton } from "@/components/ui/ModalCloseButton";
import { usePhotoTaskJobs, type PhotoTaskJob } from "./usePhotoTaskJobs";
import styles from "./OliviaDesktop.module.css";
const DISMISSED_JOB_STORAGE_KEY = "olivia.photo-task.dismissed-job-ids.v1";
const MAX_DISMISSED_JOB_IDS = 500;
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

function operationLabel(job: PhotoTaskJob): string {
  if (job.action === "PERSON_SELECT_IMPORT") return "개인별 사진 올리기";
  if (job.action === "PERSON_SELECT_DELIVERY_IMPORT") return "보정본 올리기";
  if (job.action === "PERSON_SELECT_DELIVERY_PURGE") return "보정본 보관 정리";
  if (job.action === "PERSON_SELECT_RAW_MATCH") return "개인별 셀렉 RAW 매칭";
  if (job.action === "PHOTO_PREPARE_SOURCE") return "JPG정리";
  if (job.action === "PHOTO_STAGE_JPG") return "JPG정리";
  if (job.payload?.only === "연출" || job.payload?.only === "프로필" || job.payload?.only === "인테리어") return `${job.payload.only}정리`;
  if (job.action === "PHOTO_SORT" || job.action === "PHOTO_CLASSIFY_WORK") return "분류";
  return "분류";
}

function folderName(job: PhotoTaskJob): string {
  const raw = job.payload?.source_relative_path || job.payload?.source_folder || job.payload?.work_relative_path || "촬영 폴더";
  return raw.split("/").at(-1) || raw;
}

function readDismissedJobIds(): string[] {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(DISMISSED_JOB_STORAGE_KEY) ?? "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((value): value is string => typeof value === "string" && Boolean(value)).slice(-MAX_DISMISSED_JOB_IDS);
  } catch {
    return [];
  }
}

function persistDismissedJobIds(jobIds: string[]): void {
  try {
    window.localStorage.setItem(DISMISSED_JOB_STORAGE_KEY, JSON.stringify(jobIds.slice(-MAX_DISMISSED_JOB_IDS)));
  } catch {
    // 저장소가 차단된 환경에서도 현재 화면의 닫기 동작은 유지한다.
  }
}

/** 데스크톱 상태 패널과 별개의 실행 표시줄. 실패는 사용자가 닫을 때까지 남긴다. */
export function PhotoTaskStatusBar() {
  const { jobs, updateJob } = usePhotoTaskJobs();
  const [expandedJobId, setExpandedJobId] = useState<string | null>(null);
  const [dismissedJobIds, setDismissedJobIds] = useState<string[]>(() => typeof window === "undefined" ? [] : readDismissedJobIds());

  useEffect(() => {
    const syncDismissedJobs = (event: StorageEvent) => {
      if (event.key === DISMISSED_JOB_STORAGE_KEY) setDismissedJobIds(readDismissedJobIds());
    };
    window.addEventListener("storage", syncDismissedJobs);
    return () => window.removeEventListener("storage", syncDismissedJobs);
  }, []);

  const visible = useMemo(
    () => jobs.filter((job) => !dismissedJobIds.includes(job.id)).slice(0, 4),
    [dismissedJobIds, jobs],
  );
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
            updateJob(job.id, (item) => ({ ...item, status: updated.status, message: updated.message, error: updated.error, cancel_requested_at: updated.cancelRequested ? new Date().toISOString() : null }));
          } catch (error) {
            updateJob(job.id, (item) => ({ ...item, error: error instanceof Error ? error.message : "취소 요청을 보내지 못했습니다." }));
          }
        };
        return (
          <div key={job.id} className={styles.photoTaskStatusItem}>
            <div className={styles.photoTaskStatusRow} data-state={failed ? "failed" : canceled ? "cancelled" : done ? "done" : "running"} onClick={toggleDetail} role="button" tabIndex={0} aria-expanded={expanded} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") toggleDetail(); }}>
              {failed ? <TriangleAlert size={15} /> : canceled || done ? <Check size={15} /> : <LoaderCircle size={15} className={styles.photoTaskStatusSpin} />}
              <span><strong>{operationLabel(job)} · {folderName(job)}</strong><small>{failed ? (job.error || job.message || "작업에 실패했습니다.") : canceled ? (job.message || "작업을 취소했습니다. NAS 원본은 변경되지 않았습니다.") : `${stage}${count ? ` · ${count}` : ""}`}</small>{percent !== null ? <i className={styles.photoTaskGauge}><i style={{ width: `${percent}%` }} /></i> : null}</span>
              {!failed && !done && !canceled && !cancelRequested ? <button type="button" className={styles.photoTaskCancel} onClick={(event) => void cancel(event)}><Square size={10} fill="currentColor" /> 취소</button> : cancelRequested && !canceled ? <em className={styles.photoTaskCancelPending}>취소 요청됨</em> : null}
              <ModalCloseButton
                className={styles.photoTaskClose}
                onClick={(event) => {
                  event.stopPropagation();
                  setDismissedJobIds((current) => {
                    const next = current.includes(job.id) ? current : [...current, job.id].slice(-MAX_DISMISSED_JOB_IDS);
                    persistDismissedJobIds(next);
                    return next;
                  });
                  setExpandedJobId((current) => current === job.id ? null : current);
                }}
              />
            </div>
            {expanded ? <div className={styles.photoTaskStatusDetail}><RemotePhotoProgressDetails job={{ status: job.status, progress: job.progress ?? null, message: job.message, error: job.error, cancelRequested }} sourceFolder={sourceFolder} /></div> : null}
          </div>
        );
      })}
    </aside>
  );
}
