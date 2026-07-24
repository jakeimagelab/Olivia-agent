import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveClientId } from "@/lib/clientLookup";
import { createEventDeduplicationKey, emitOliviaEventSafely } from "@/lib/olivia/events";
import type { CreateReviewInput } from "./types";

function cleanText(value: unknown, max: number) {
  return String(value ?? "").trim().slice(0, max);
}

function validRating(value: number | null | undefined, fallback = 5) {
  if (value == null) return fallback;
  if (!Number.isInteger(value) || value < 1 || value > 5) throw new Error("만족도는 1~5 사이여야 합니다.");
  return value;
}

async function resolveClient(db: SupabaseClient, input: CreateReviewInput) {
  const clientId = input.clientId || await resolveClientId(db, input.hospitalName);
  if (!clientId) throw new Error("리뷰를 연결할 고객을 찾지 못했습니다. 고객관리에서 기존 고객을 선택해주세요.");
  const { data, error } = await db.from("clients").select("*").eq("id", clientId).maybeSingle();
  if (error || !data) throw new Error(error?.message || "고객 정보를 확인하지 못했습니다.");
  return data as Record<string, any>;
}

async function resolveWorkflowRun(db: SupabaseClient, clientId: string, requested?: string | null) {
  if (requested) {
    const { data } = await db.from("workflow_runs").select("id").eq("id", requested).eq("client_id", clientId).maybeSingle();
    if (data) return String(data.id);
  }
  const { data } = await db
    .from("workflow_runs")
    .select("id")
    .eq("client_id", clientId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.id ? String(data.id) : null;
}

export async function createUnifiedReview(db: SupabaseClient, input: CreateReviewInput) {
  const client = await resolveClient(db, input);
  const workflowRunId = await resolveWorkflowRun(db, String(client.id), input.workflowRunId);
  const publicReviewText = cleanText(input.publicReviewText || input.goodPoints, 20_000);
  const goodPoints = cleanText(input.goodPoints || publicReviewText, 10_000);
  if (!publicReviewText && !goodPoints) throw new Error("리뷰 내용을 입력해주세요.");

  const { data: review, error } = await db.from("client_reviews").insert({
    client_id: client.id,
    workflow_run_id: workflowRunId,
    overall_rating: validRating(input.overallRating),
    shooting_rating: validRating(input.shootingRating),
    result_rating: validRating(input.resultRating),
    good_points: goodPoints,
    improvement_points: cleanText(input.improvementPoints, 10_000),
    public_review_text: publicReviewText,
    allow_public_use: Boolean(input.allowPublicUse),
    allow_hospital_name: input.allowHospitalName ?? true,
    writer_name: cleanText(input.writerName, 120),
    source: input.source,
    source_channel: cleanText(input.sourceChannel, 120),
    delivered_at: input.deliveredAt || null,
    content_status: "unused",
  }).select("*").single();
  if (error || !review) throw new Error(error?.message || "리뷰 저장에 실패했습니다.");

  const tasks = [
    {
      client_id: client.id,
      workflow_run_id: workflowRunId,
      workflow_step_key: "review_content",
      workflow_step_name: "후기 DB 저장 / 콘텐츠 제작",
      task_type: "review_summarize",
      title: `리뷰 요약 생성: ${client.hospital_name || client.name || "고객"}`,
      description: "등록된 리뷰를 요약하고 콘텐츠 후보를 분석합니다.",
      input_data: { reviewId: review.id, overallRating: review.overall_rating, publicReviewText },
      priority: "normal",
      status: "pending",
    },
    {
      client_id: client.id,
      workflow_run_id: workflowRunId,
      workflow_step_key: "review_content",
      workflow_step_name: "후기 DB 저장 / 콘텐츠 제작",
      task_type: "review_to_content",
      title: `리뷰 콘텐츠 후보: ${client.hospital_name || client.name || "고객"}`,
      description: "공개 동의와 위험 표현을 확인해 인스타그램 콘텐츠 후보를 만듭니다.",
      input_data: { reviewId: review.id, allowPublicUse: review.allow_public_use, publicReviewText },
      priority: "normal",
      status: "pending",
    },
    {
      client_id: client.id,
      workflow_run_id: workflowRunId,
      workflow_step_key: "review_content",
      workflow_step_name: "후기 DB 저장 / 콘텐츠 제작",
      task_type: "review_risk_check",
      title: `리뷰 위험 점검: ${client.hospital_name || client.name || "고객"}`,
      description: "개인정보·의료광고 표현·개선 요청을 확인합니다.",
      input_data: { reviewId: review.id, overallRating: review.overall_rating, improvementPoints: review.improvement_points },
      priority: review.overall_rating <= 3 ? "high" : "normal",
      status: "pending",
    },
  ];

  await Promise.all([
    db.from("agent_tasks").insert(tasks),
    db.from("agent_logs").insert({
      client_id: client.id,
      workflow_run_id: workflowRunId,
      log_type: "review_registered",
      message: `[리뷰] ${input.sourceChannel || input.source}에서 리뷰가 등록되었습니다.`,
      success: true,
    }),
    emitOliviaEventSafely(db, {
      eventType: "review.registered",
      eventSource: input.source,
      clientId: String(client.id),
      workflowRunId,
      actorType: input.source === "olivia_chat" ? "local_agent" : "admin",
      payload: { reviewId: review.id, allowPublicUse: review.allow_public_use },
      deduplicationKey: createEventDeduplicationKey("review.registered", String(client.id), String(review.id)),
    }),
  ]);

  return {
    review,
    client,
    workflowRunId,
  };
}
