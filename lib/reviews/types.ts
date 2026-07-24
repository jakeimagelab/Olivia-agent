export type ReviewSource = "manual" | "client_portal" | "olivia_chat" | "legacy";

export type CreateReviewInput = {
  clientId?: string | null;
  hospitalName?: string | null;
  workflowRunId?: string | null;
  source: ReviewSource;
  sourceChannel?: string;
  overallRating?: number | null;
  shootingRating?: number | null;
  resultRating?: number | null;
  goodPoints?: string;
  improvementPoints?: string;
  publicReviewText?: string;
  allowPublicUse?: boolean;
  allowHospitalName?: boolean;
  writerName?: string;
  deliveredAt?: string | null;
};

export type UnifiedReview = {
  id: string;
  client_id: string;
  workflow_run_id?: string | null;
  hospital_name: string;
  reviewer_name: string;
  channel: string;
  rating: number | null;
  review_text: string;
  improve_text: string;
  delivered_at?: string | null;
  permission_to_publish: boolean;
  content_status?: string;
  source?: ReviewSource;
  created_at?: string;
};
