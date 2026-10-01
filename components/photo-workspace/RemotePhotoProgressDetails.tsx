"use client";

import { Check, Circle, LoaderCircle, TriangleAlert, X } from "lucide-react";
import {
  REMOTE_PHOTO_PROGRESS_STEPS,
  remotePhotoProgressPercent,
  remotePhotoProgressStepState,
  remotePhotoProgressSummary,
  type RemotePhotoProgressDetailInput,
} from "@/lib/photo-classifier/remotePhotoProgressDetail";
import styles from "./RemotePhotoProgressDetails.module.css";

type Props = {
  job: RemotePhotoProgressDetailInput;
  sourceFolder?: string | null;
};

function formatBytes(value: number | undefined): string | null {
  if (value === undefined || !Number.isFinite(value)) return null;
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function StepIcon({ state }: { state: ReturnType<typeof remotePhotoProgressStepState> }) {
  if (state === "completed") return <Check size={13} aria-hidden="true" />;
  if (state === "current") return <LoaderCircle size={13} className={styles.spin} aria-hidden="true" />;
  if (state === "failed") return <TriangleAlert size={13} aria-hidden="true" />;
  if (state === "cancelled") return <X size={13} aria-hidden="true" />;
  return <Circle size={11} aria-hidden="true" />;
}

/** 상태 표시줄에서 원격 사진분류의 안전한 실행 순서를 그대로 설명한다. */
export default function RemotePhotoProgressDetails({ job, sourceFolder }: Props) {
  const progress = job.progress ?? null;
  const percent = remotePhotoProgressPercent(progress);
  const copied = formatBytes(progress?.copiedBytes);
  const totalBytes = formatBytes(progress?.totalBytes);
  const count = progress?.current !== undefined && progress.total !== undefined
    ? `${progress.current.toLocaleString()} / ${progress.total.toLocaleString()}장`
    : null;

  return (
    <section className={styles.details} aria-live="polite" aria-label="사진 분류 진행 상세">
      <header className={styles.header}>
        <span>
          <strong>사진 분류 진행 상세</strong>
          {sourceFolder ? <small>NAS: {sourceFolder}</small> : null}
          {sourceFolder ? <small>Agentstation 작업본: {sourceFolder}/JPG전체</small> : null}
        </span>
        {percent !== null ? <b>{percent}%</b> : null}
      </header>
      {percent !== null ? <span className={styles.gauge} aria-label={`진행률 ${percent}%`}><i style={{ width: `${percent}%` }} /></span> : null}
      <p className={styles.current}>{remotePhotoProgressSummary(job)}</p>
      {count || copied || totalBytes ? (
        <p className={styles.metrics}>
          {count ? <span>파일 {count}</span> : null}
          {copied && totalBytes ? <span>복사 {copied} / {totalBytes}</span> : null}
        </p>
      ) : null}
      <ol className={styles.steps}>
        {REMOTE_PHOTO_PROGRESS_STEPS.map((step) => {
          const state = remotePhotoProgressStepState(job, step);
          return (
            <li key={step.id} data-state={state}>
              <span className={styles.stepIcon}><StepIcon state={state} /></span>
              <span><strong>{step.label}</strong><small>{step.detail}</small></span>
            </li>
          );
        })}
      </ol>
      <p className={styles.safety}>NAS 원본과 Agentstation의 검증된 JPG 작업본은 직접 변경하지 않습니다.</p>
    </section>
  );
}
