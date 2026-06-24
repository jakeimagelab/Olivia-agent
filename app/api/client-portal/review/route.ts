import { NextRequest, NextResponse } from "next/server";
import { validatePortalToken, logPortalEvent } from "@/lib/clientPortal";
import { getSupabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const token = req.headers.get("x-portal-token") ?? "";
  const session = await validatePortalToken(token);
  if (!session) return NextResponse.json({ ok: false, error: "인증 필요" }, { status: 401 });

  const db = getSupabaseAdmin();
  const { data } = await db
    .from("client_reviews")
    .select("*")
    .eq("client_id", session.clientId)
    .single();

  return NextResponse.json({ ok: true, review: data ?? null });
}

export async function POST(req: NextRequest) {
  const token = req.headers.get("x-portal-token") ?? "";
  const session = await validatePortalToken(token);
  if (!session) return NextResponse.json({ ok: false, error: "인증 필요" }, { status: 401 });

  const db = getSupabaseAdmin();
  const existing = await db.from("client_reviews").select("id").eq("client_id", session.clientId).single();
  if (existing.data) return NextResponse.json({ ok: false, error: "이미 리뷰를 작성하셨습니다." }, { status: 409 });

  const body = await req.json();
  const {
    overallRating, shootingRating, resultRating,
    goodPoints, improvementPoints, publicReviewText,
    allowPublicUse, allowHospitalName, writerName,
  } = body;

  if (!overallRating) return NextResponse.json({ ok: false, error: "전체 만족도를 입력해주세요." }, { status: 400 });

  const { data, error } = await db
    .from("client_reviews")
    .insert({
      client_id: session.clientId,
      overall_rating: overallRating,
      shooting_rating: shootingRating ?? 5,
      result_rating: resultRating ?? 5,
      good_points: goodPoints ?? "",
      improvement_points: improvementPoints ?? "",
      public_review_text: publicReviewText ?? "",
      allow_public_use: allowPublicUse ?? false,
      allow_hospital_name: allowHospitalName ?? true,
      writer_name: writerName ?? session.managerName,
    })
    .select("id")
    .single();

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  await Promise.all([
    db.from("agent_tasks").insert([
      {
        client_id: session.clientId,
        workflow_run_id: session.workflowRunId,
        task_type: "review_summarize",
        title: `리뷰 요약 생성: ${session.clientName}`,
        description: `고객 리뷰(평점 ${overallRating}/5)를 요약하고 내부 메모를 생성합니다.`,
        input_data: { reviewId: data.id, overallRating, goodPoints, improvementPoints, publicReviewText },
        priority: "normal",
        status: "pending",
      },
      {
        client_id: session.clientId,
        workflow_run_id: session.workflowRunId,
        task_type: "review_to_content",
        title: `리뷰 콘텐츠 초안: ${session.clientName}`,
        description: "수집된 리뷰를 SNS 콘텐츠 초안으로 변환합니다.",
        input_data: { reviewId: data.id, allowPublicUse: allowPublicUse ?? false, publicReviewText },
        priority: "normal",
        status: "pending",
      },
      {
        client_id: session.clientId,
        workflow_run_id: session.workflowRunId,
        task_type: "review_risk_check",
        title: `리뷰 위험 감지: ${session.clientName}`,
        description: "개선 요청 내용을 분석하여 고객 이탈 위험 여부를 판단합니다.",
        input_data: { reviewId: data.id, overallRating, improvementPoints },
        priority: overallRating <= 3 ? "high" : "normal",
        status: "pending",
      },
    ]),
    session.workflowRunId
      ? db
          .from("workflow_runs")
          .update({ current_step_key: "review_collected", updated_at: new Date().toISOString() })
          .eq("id", session.workflowRunId)
      : Promise.resolve(),
    logPortalEvent({
      clientId: session.clientId,
      eventType: "review_submitted",
      targetType: "review",
      targetId: data.id,
      workflowRunId: session.workflowRunId,
    }),
  ]);

  return NextResponse.json({ ok: true, id: data.id });
}
