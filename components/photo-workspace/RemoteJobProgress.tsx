"use client";

import { Check, LoaderCircle, RotateCw, TriangleAlert } from "lucide-react";
import type { RemotePhotoSortJob } from "@/lib/photo-classifier/remotePhotoSort";
import type { RemotePollingState } from "./PhotoStudioExecutionContext";
import styles from "./RemoteJobProgress.module.css";

const STAGES = [
  ["STAGING", "작업 폴더 복사"],
  ["SCANNING", "사진 확인"],
  ["ANALYZING", "사진 분석"],
  ["ORGANIZING", "Scene 분류·파일 정리"],
  ["VERIFYING", "결과 검증"],
] as const;

export default function RemoteJobProgress({
  job,
  pollingState,
  pollingMessage,
  compact = false,
}: {
  job: RemotePhotoSortJob | null;
  pollingState: RemotePollingState;
  pollingMessage?: string;
  compact?: boolean;
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

  return (
    <section className={`${styles.panel} ${compact ? styles.compact : ""}`} aria-live="polite">
      <div className={styles.heading}>
        <span>
          {isFailed ? <TriangleAlert size={16} /> : isComplete ? <Check size={16} /> : <LoaderCircle className={styles.spin} size={16} />}
          <strong>{isFailed ? "작업 실패" : isComplete ? "작업 완료" : isQueued ? "Mac Studio 작업 대기 중" : "Mac Studio 작업 중"}</strong>
        </span>
        {percent !== null ? <b>{percent}%</b> : null}
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
            const active = !isComplete && !isFailed && currentStageIndex === index;
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

      <p>{isFailed ? (job.error || job.message || "Mac Studio 작업에 실패했습니다.") : progress?.message || job.message || pollingMessage || "작업 상태를 확인하고 있습니다."}</p>
    </section>
  );
}
