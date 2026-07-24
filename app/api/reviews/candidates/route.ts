import { NextRequest, NextResponse } from "next/server";
import { isAdminSession } from "@/lib/passkey";
import { getSupabaseAdmin } from "@/lib/supabase";
import { normalizeClientReview } from "@/lib/reviews/normalizeReview";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function riskFlags(row: Record<string, any>) {
  const text = `${row.public_review_text || ""} ${row.good_points || ""} ${row.improvement_points || ""}`;
  const flags: string[] = [];
  if (Number(row.overall_rating || 0) < 4) flags.push("low_rating");
  if (String(row.improvement_points || "").trim()) flags.push("improvement_note");
  if (/(완치|보장|부작용\s*없|최고|유일|100%|무조건)/i.test(text)) flags.push("medical_ad_risk");
  if (/\b01[016789][-\s]?\d{3,4}[-\s]?\d{4}\b/.test(text)) flags.push("personal_data");
  return flags;
}

export async function GET(req: NextRequest) {
  if (!isAdminSession(req)) {
    return NextResponse.json({ ok: false, error: "관리자 로그인이 필요합니다." }, { status: 401 });
  }
  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("client_reviews")
    .select("*, clients(*)")
    .eq("allow_public_use", true)
    .in("content_status", ["unused", "candidate"])
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  const candidates = (data ?? []).map((row) => {
    const flags = riskFlags(row as Record<string, any>);
    const review = normalizeClientReview(row as Record<string, any>);
    const lengthScore = Math.min(30, Math.floor(review.review_text.length / 8));
    const ratingScore = Math.max(0, Number(review.rating || 0) - 3) * 20;
    const recencyScore = Math.max(0, 20 - Math.floor((Date.now() - new Date(review.created_at || 0).getTime()) / 86400000));
    return {
      ...review,
      riskFlags: flags,
      eligible: flags.length === 0 && review.review_text.length >= 20,
      score: Math.max(0, ratingScore + lengthScore + recencyScore - flags.length * 25),
      selectionReason: flags.length
        ? "대표 확인이 필요한 표현이 포함되어 있습니다."
        : "공개 동의, 만족도, 내용의 구체성이 콘텐츠 기준에 적합합니다.",
    };
  }).sort((a, b) => b.score - a.score);

  return NextResponse.json({ ok: true, candidates });
}
