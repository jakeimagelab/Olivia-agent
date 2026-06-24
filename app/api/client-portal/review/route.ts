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
  const { overallRating, shootingRating, resultRating, goodPoints, improvementPoints, publicReviewText, allowPublicUse, allowHospitalName, writerName } = body;

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

  await logPortalEvent({ clientId: session.clientId, eventType: "review_submitted", targetType: "review", targetId: data.id });

  return NextResponse.json({ ok: true, id: data.id });
}
