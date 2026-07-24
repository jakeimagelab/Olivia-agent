import type { UnifiedReview } from "./types";

export function normalizeClientReview(row: Record<string, any>): UnifiedReview {
  const client = row.clients || {};
  return {
    id: String(row.id),
    client_id: String(row.client_id),
    workflow_run_id: row.workflow_run_id || null,
    hospital_name: String(client.hospital_name || client.name || row.hospital_name || "고객 미상"),
    reviewer_name: String(row.writer_name || ""),
    channel: String(row.source_channel || row.source || ""),
    rating: row.overall_rating == null ? null : Number(row.overall_rating),
    review_text: String(row.public_review_text || row.good_points || ""),
    improve_text: String(row.improvement_points || ""),
    delivered_at: row.delivered_at || null,
    permission_to_publish: Boolean(row.allow_public_use),
    content_status: String(row.content_status || "unused"),
    source: row.source || "manual",
    created_at: row.created_at,
  };
}
