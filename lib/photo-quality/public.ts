import { isPhotoQualityFlag, type PublicPhotoQualityResult } from "./types";

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
