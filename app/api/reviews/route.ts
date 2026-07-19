import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getErrorMessage } from "@/lib/errors";
import { resolveClientId } from "@/lib/clientLookup";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

async function generateAndSaveDraft(review: {
  id: string; hospital_name: string; reviewer_name?: string;
  rating?: number; review_text: string;
}) {
  try {
    const db = getSupabaseAdmin();
    const msg = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 400,
      messages: [{
        role: "user",
        content: `병원 촬영 후기를 바탕으로 인스타그램 캡션 초안을 한국어로 작성해줘. 150자 이내, 해시태그 5개 포함. JSON만 응답:
{"caption":"...", "hashtags":"#포토클리닉 ..."}

후기: "${review.review_text}"
병원: ${review.hospital_name} (${review.rating}점)`,
      }],
    });
    const raw = (msg.content[0] as Anthropic.TextBlock).text;
    const m = raw.match(/\{[\s\S]*\}/);
    if (!m) return;
    const parsed = JSON.parse(m[0]);
    await db.from("mailing_queue").insert({
      type: "review_form",
      status: "draft",
      hospital_name: review.hospital_name,
      subject: `[자동생성] ${review.hospital_name} 후기 콘텐츠 초안`,
      body: `${parsed.caption}\n\n${parsed.hashtags}`,
      source_module: "review-auto",
      created_at: new Date().toISOString(),
    });
  } catch {
    // 백그라운드 실패는 무시
  }
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const mockReviews = [
  {
    id: "mock-review-1",
    hospital_name: "포토클리닉",
    reviewer_name: "정연호",
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
      note: getErrorMessage(error)
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
    improveText,
    deliveredAt,
    permissionToPublish
  } = body as {
    hospitalName?: string;
    reviewerName?: string;
    channel?: string;
    rating?: number;
    reviewText?: string;
    improveText?: string;
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
        improve_text: improveText || "",
        delivered_at: deliveredAt || null,
        permission_to_publish: Boolean(permissionToPublish)
      })
      .select()
      .single();

    if (error) throw error;

    // 백그라운드: 인스타 콘텐츠 초안 자동 생성 (응답 블로킹 없음)
    if (data && Boolean(body.permissionToPublish)) {
      generateAndSaveDraft({
        id: data.id, hospital_name: data.hospital_name,
        reviewer_name: data.reviewer_name, rating: data.rating,
        review_text: data.review_text,
      }).catch(() => {});
    }

    return NextResponse.json({ ok: true, review: data });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: getErrorMessage(error) },
      { status: 500 }
    );
  }
}
