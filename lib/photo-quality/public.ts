import { isPhotoQualityFlag, type PublicPhotoQualityResult } from "./types";

export type PhotoQualityJobProgress = {
  status: string;
  label: string;
  total: number;
  completed: number;
  failed: number;
  processed: number;
  pending: number;
  percent: number;
  active: boolean;
};

const PHOTO_QUALITY_JOB_LABELS: Record<string, string> = {
  queued: "검사 대기 중",
  running: "AI 검사 중",
  paused: "검사 일시정지",
  completed: "검사 완료",
  partial_failed: "일부 사진 검사 실패",
  failed: "검사 실패",
  canceled: "검사 취소",
};

function nonNegativeCount(value: unknown) {
  const count = Number(value ?? 0);
  return Number.isFinite(count) ? Math.max(0, Math.trunc(count)) : 0;
}

export function photoQualityJobProgress(job: Record<string, unknown> | null | undefined): PhotoQualityJobProgress | null {
  if (!job) return null;
  const status = typeof job.status === "string" ? job.status : "unknown";
  const total = nonNegativeCount(job.total_count);
  const completedCount = nonNegativeCount(job.completed_count);
  const failedCount = nonNegativeCount(job.failed_count);
  const completed = total ? Math.min(total, completedCount) : completedCount;
  const failed = total ? Math.min(Math.max(0, total - completed), failedCount) : failedCount;
  const processed = total ? Math.min(total, completed + failed) : completed + failed;
  const pending = Math.max(0, total - processed);
  return {
    status,
    label: PHOTO_QUALITY_JOB_LABELS[status] ?? "검사 상태 확인 필요",
    total,
    completed,
    failed,
    processed,
    pending,
    percent: total ? Math.min(100, Math.round((processed / total) * 100)) : 0,
    active: status === "queued" || status === "running" || status === "paused",
  };
}

export function publicPhotoQualityResult(row: Record<string, any>): PublicPhotoQualityResult {
  const flags = Array.isArray(row.flags) ? row.flags.filter(isPhotoQualityFlag) : [];
  return {
    imageId: String(row.image_id),
    status: row.analysis_status,
    flags,
    confidence: row.confidence && typeof row.confidence === "object" ? row.confidence : {},
    explanation: row.explanation && typeof row.explanation === "object" ? row.explanation : {},
    reviewStatus: row.review_status ?? "unreviewed",
    analyzedAt: row.analyzed_at ?? null,
  };
}

export function photoQualityCounts(rows: Array<Record<string, any>>) {
  const counts = { total: rows.length, eyes_closed: 0, face_too_dark: 0, motion_blur: 0, needs_review: 0, normal: 0, failed: 0 };
  for (const row of rows) {
    const flags = Array.isArray(row.flags) ? row.flags : [];
    if (flags.includes("eyes_closed")) counts.eyes_closed += 1;
    if (flags.includes("face_too_dark")) counts.face_too_dark += 1;
    if (flags.includes("motion_blur")) counts.motion_blur += 1;
    if (row.analysis_status === "needs_review") counts.needs_review += 1;
    if (row.analysis_status === "normal") counts.normal += 1;
    if (row.analysis_status === "failed") counts.failed += 1;
  }
  return counts;
}

/** 같은 사진이 파일 변경으로 다시 분석된 경우 가장 최근 결과만 화면에 노출한다. */
export function latestPhotoQualityResults(rows: Array<Record<string, any>>) {
  const latest = new Map<string, Record<string, any>>();
  for (const row of rows) {
    const imageId = String(row.image_id ?? "");
    if (imageId && !latest.has(imageId)) latest.set(imageId, row);
  }
  return [...latest.values()];
}
