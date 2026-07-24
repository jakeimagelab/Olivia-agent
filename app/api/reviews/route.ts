import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getErrorMessage } from "@/lib/errors";
import { createUnifiedReview } from "@/lib/reviews/createReview";
import { normalizeClientReview } from "@/lib/reviews/normalizeReview";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const db = getSupabaseAdmin();
    const clientId = req.nextUrl.searchParams.get("clientId");
    let query = db
      .from("client_reviews")
      .select("*, clients(*)")
      .order("created_at", { ascending: false })
      .limit(200);
    if (clientId) query = query.eq("client_id", clientId);
    const { data, error } = await query;
    if (error) throw error;
    return NextResponse.json({
      ok: true,
      reviews: (data ?? []).map((row) => normalizeClientReview(row as Record<string, any>)),
    });
  } catch (error) {
    return NextResponse.json({ ok: false, error: getErrorMessage(error) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const hospitalName = String(body.hospitalName || "").trim();
    const reviewText = String(body.reviewText || body.publicReviewText || "").trim();
    if ((!body.clientId && !hospitalName) || !reviewText) {
      return NextResponse.json({ ok: false, error: "고객과 리뷰 내용은 필수입니다." }, { status: 400 });
    }

    const result = await createUnifiedReview(getSupabaseAdmin(), {
      clientId: body.clientId || null,
      hospitalName,
      workflowRunId: body.workflowRunId || null,
      source: body.source === "olivia_chat" ? "olivia_chat" : "manual",
      sourceChannel: String(body.channel || body.sourceChannel || "직접 입력"),
      overallRating: body.rating == null || body.rating === "" ? 5 : Number(body.rating),
      shootingRating: body.shootingRating == null ? undefined : Number(body.shootingRating),
      resultRating: body.resultRating == null ? undefined : Number(body.resultRating),
      goodPoints: String(body.goodPoints || reviewText),
      improvementPoints: String(body.improveText || body.improvementPoints || ""),
      publicReviewText: reviewText,
      allowPublicUse: Boolean(body.permissionToPublish ?? body.allowPublicUse),
      allowHospitalName: body.allowHospitalName ?? true,
      writerName: String(body.reviewerName || body.writerName || ""),
      deliveredAt: body.deliveredAt || null,
    });

    return NextResponse.json({
      ok: true,
      review: normalizeClientReview({ ...result.review, clients: result.client }),
      workflowRunId: result.workflowRunId,
    });
  } catch (error) {
    const message = getErrorMessage(error);
    const status = message.includes("찾지 못했습니다") ? 404 : message.includes("입력") || message.includes("1~5") ? 400 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
