import { NextRequest, NextResponse } from "next/server";
import { validatePortalToken, logPortalEvent } from "@/lib/clientPortal";
import { getSupabaseAdmin } from "@/lib/supabase";
import { createUnifiedReview } from "@/lib/reviews/createReview";

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
    .or("source.eq.client_portal,source.is.null")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return NextResponse.json({ ok: true, review: data ?? null });
}

export async function POST(req: NextRequest) {
  const token = req.headers.get("x-portal-token") ?? "";
  const session = await validatePortalToken(token);
  if (!session) return NextResponse.json({ ok: false, error: "인증 필요" }, { status: 401 });

  const db = getSupabaseAdmin();
  const existing = await db
    .from("client_reviews")
    .select("id")
    .eq("client_id", session.clientId)
    .or("source.eq.client_portal,source.is.null")
    .limit(1)
    .maybeSingle();
  if (existing.data) return NextResponse.json({ ok: false, error: "이미 리뷰를 작성하셨습니다." }, { status: 409 });

  const body = await req.json();
  const {
    overallRating, shootingRating, resultRating,
    goodPoints, improvementPoints, publicReviewText,
    allowPublicUse, allowHospitalName, writerName,
  } = body;

  if (!overallRating) return NextResponse.json({ ok: false, error: "전체 만족도를 입력해주세요." }, { status: 400 });

  try {
    const result = await createUnifiedReview(db, {
      clientId: session.clientId,
      workflowRunId: session.workflowRunId,
      source: "client_portal",
      sourceChannel: "고객 포털",
      overallRating: Number(overallRating),
      shootingRating: shootingRating == null ? 5 : Number(shootingRating),
      resultRating: resultRating == null ? 5 : Number(resultRating),
      goodPoints: goodPoints ?? "",
      improvementPoints: improvementPoints ?? "",
      publicReviewText: publicReviewText ?? "",
      allowPublicUse: allowPublicUse ?? false,
      allowHospitalName: allowHospitalName ?? true,
      writerName: writerName ?? session.managerName,
    });
    await logPortalEvent({
      clientId: session.clientId,
      eventType: "review_submitted",
      targetType: "review",
      targetId: result.review.id,
      workflowRunId: result.workflowRunId,
    });
    return NextResponse.json({ ok: true, id: result.review.id });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      error: error instanceof Error ? error.message : "리뷰 저장에 실패했습니다.",
    }, { status: 500 });
  }
}
