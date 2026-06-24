import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface SaveBlogInput {
  hospitalId?: string;
  styleProfileId?: string;
  blogType: string;
  title: string;
  body: string;
  metaDescription?: string;
  hashtags?: string[];
  seoKeywords?: string[];
  instagramSummary?: string;
  naverPlaceVersion?: string;
  cta?: string;
  riskCheckResult?: object;
  status?: string;
}

export async function POST(req: NextRequest) {
  const cookieStore = await cookies();
  if (cookieStore.get("pc_admin_session")?.value !== "active") {
    return NextResponse.json({ ok: false, error: "인증이 필요합니다." }, { status: 401 });
  }

  let input: SaveBlogInput;
  try {
    input = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "요청 본문 파싱 실패" }, { status: 400 });
  }

  const {
    hospitalId,
    styleProfileId,
    blogType,
    title,
    body,
    metaDescription,
    hashtags,
    seoKeywords,
    instagramSummary,
    naverPlaceVersion,
    cta,
    riskCheckResult,
    status,
  } = input;

  if (!blogType?.trim() || !title?.trim() || !body?.trim()) {
    return NextResponse.json(
      { ok: false, error: "blogType, title, body는 필수입니다." },
      { status: 400 }
    );
  }

  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from("blog_posts")
    .insert({
      hospital_id: hospitalId ?? null,
      style_profile_id: styleProfileId ?? null,
      blog_type: blogType,
      title,
      body,
      meta_description: metaDescription ?? null,
      hashtags: hashtags ?? [],
      seo_keywords: seoKeywords ?? [],
      instagram_summary: instagramSummary ?? null,
      naver_place_version: naverPlaceVersion ?? null,
      cta: cta ?? null,
      risk_check_result: riskCheckResult ?? null,
      status: status ?? "draft",
      created_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (error) {
    console.error("blog_posts insert error:", error);
    return NextResponse.json(
      { ok: false, error: `저장 실패: ${error.message}` },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, id: data.id });
}
