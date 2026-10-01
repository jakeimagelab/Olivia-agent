"use client";

import { Ban, Check, LoaderCircle, RotateCw, Square, TriangleAlert } from "lucide-react";
import type { RemotePhotoSortJob } from "@/lib/photo-classifier/remotePhotoSort";
import { describeRemotePhotoFailure } from "@/lib/photo-classifier/remotePhotoFailure";
import type { RemotePollingState } from "./PhotoStudioExecutionContext";
import styles from "./RemoteJobProgress.module.css";

const STAGES = [
  ["STAGING", "작업 폴더 복사"],
  ["PREPARING", "JPG정리"],
  ["COPYING", "파일 복사"],
  ["COPY_VERIFYING", "복사본 검증"],
  ["SCANNING", "사진 확인"],
  ["ANALYZING", "사진 분석"],
  ["SCENE_ANALYSIS", "장면 분석"],
  ["FEATURE_EXTRACTION", "특징 추출"],
  ["BOUNDARY_ANALYSIS", "경계 분석"],
  ["ORGANIZING", "사진 정리"],
  ["FINAL_VERIFYING", "최종 검증"],
  ["VERIFYING", "결과 검증"],
] as const;

export default function RemoteJobProgress({
  job,
  pollingState,
  pollingMessage,
  compact = false,
  label,
  onCancel,
}: {
  job: (Pick<RemotePhotoSortJob, "id" | "status" | "message" | "error" | "progress"> & { cancelRequested?: boolean }) | null;
  pollingState: RemotePollingState;
  pollingMessage?: string;
  compact?: boolean;
  label?: string;
  onCancel?: () => void;
}) {
  if (!job) return null;

  const progress = job.progress;
  const currentStageIndex = progress
    ? STAGES.findIndex(([stage]) => stage === progress.stage)
    : -1;
  const percent = progress?.current !== undefined && progress.total
    ? Math.min(100, Math.round((progress.current / progress.total) * 100))
    : null;
  const isQueued = job.status === "QUEUED";
  const isFailed = job.status === "FAILED";
  const isComplete = job.status === "COMPLETED";
  const isCanceled = job.status === "CANCELED";
  const cancellable = Boolean(onCancel) && !isFailed && !isComplete && !isCanceled && !job.cancelRequested;
  const failure = isFailed ? describeRemotePhotoFailure(job.error || job.message) : null;

  return (
    <section className={`${styles.panel} ${compact ? styles.compact : ""}`} aria-live="polite">
      <div className={styles.heading}>
        <span>
          {isFailed ? <TriangleAlert size={16} /> : isCanceled ? <Ban size={16} /> : isComplete ? <Check size={16} /> : <LoaderCircle className={styles.spin} size={16} />}
          <strong>{isFailed ? failure!.title : isCanceled ? "작업 취소됨" : label || (isComplete ? "작업 완료" : isQueued ? "Mac Studio 작업 대기 중" : "Mac Studio 작업 중")}</strong>
        </span>
        <span className={styles.actions}>
          {percent !== null ? <b>{percent}%</b> : null}
          {cancellable ? <button type="button" className={styles.cancel} onClick={onCancel}><Square size={11} fill="currentColor" /> 취소</button> : null}
          {job.cancelRequested && !isCanceled ? <em>취소 요청됨</em> : null}
        </span>
      </div>

      {pollingState === "reconnecting" && !isFailed ? (
        <div className={styles.reconnecting}>
          <RotateCw size={13} />
          <span>Mac Studio에서 작업은 계속 진행 중입니다. 연결을 다시 확인하고 있습니다.</span>
        </div>
      ) : null}

      {!compact ? (
        <ol className={styles.steps}>
          {STAGES.map(([stage, label], index) => {
            const complete = isComplete || currentStageIndex > index;
            const active = !isComplete && !isFailed && !isCanceled && currentStageIndex === index;
            return (
              <li key={stage} data-state={complete ? "complete" : active ? "active" : "waiting"}>
                <i>{complete ? <Check size={11} /> : index + 1}</i>
                <span>{label}</span>
                {active && progress?.current !== undefined && progress.total !== undefined
                  ? <small>{progress.current.toLocaleString()} / {progress.total.toLocaleString()}</small>
                  : active ? <small>진행 중</small> : null}
              </li>
            );
          })}
        </ol>
      ) : null}

      <p>{isFailed ? failure!.detail : isCanceled ? job.message || "작업을 취소했습니다. NAS 원본은 변경되지 않았습니다." : progress?.message || job.message || pollingMessage || "작업 상태를 확인하고 있습니다."}</p>
    </section>
  );
}
