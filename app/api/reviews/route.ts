import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const mockReviews = [
  {
    id: "mock-review-1",
    hospital_name: "온유성형외과",
    reviewer_name: "김실장님",
    channel: "카카오톡",
    rating: 5,
    review_text: "원장님과 직원들이 촬영 결과물을 보고 정말 만족했습니다. 병원 분위기가 따뜻하고 전문적으로 잘 표현됐어요.",
    permission_to_publish: true,
    delivered_at: "2026-06-13",
    created_at: new Date().toISOString()
  }
];

export async function GET() {
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("delivery_reviews")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) throw error;
    return NextResponse.json({ ok: true, reviews: data || [] });
  } catch (error) {
    return NextResponse.json({
      ok: true,
      mock: true,
      reviews: mockReviews,
      note: error instanceof Error ? error.message : String(error)
    });
  }
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const {
    hospitalName,
    reviewerName,
    channel,
    rating,
    reviewText,
    deliveredAt,
    permissionToPublish
  } = body as {
    hospitalName?: string;
    reviewerName?: string;
    channel?: string;
    rating?: number;
    reviewText?: string;
    deliveredAt?: string;
    permissionToPublish?: boolean;
  };

  if (!hospitalName || !reviewText) {
    return NextResponse.json({ ok: false, error: "병원명과 리뷰 내용은 필수입니다." }, { status: 400 });
  }

  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("delivery_reviews")
      .insert({
        hospital_name: hospitalName,
        reviewer_name: reviewerName || "",
        channel: channel || "직접 입력",
        rating: rating || null,
        review_text: reviewText,
        delivered_at: deliveredAt || null,
        permission_to_publish: Boolean(permissionToPublish)
      })
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ ok: true, review: data });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
