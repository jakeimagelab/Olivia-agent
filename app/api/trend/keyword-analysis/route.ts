import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { generateKeywordInsight } from "@/lib/trend/insights";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const keyword = (searchParams.get("keyword") || "").trim();
  if (!keyword) {
    return NextResponse.json({ ok: false, error: "keyword가 필요합니다." }, { status: 400 });
  }

  const db = getSupabaseAdmin();
  const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const sinceTs = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();

  // ── 검색량 시계열: 이 키워드로 저장된 trend_keywords 행 ──
  const { data: keywordRows } = await db
    .from("trend_keywords")
    .select("*")
    .ilike("keyword", `%${keyword}%`)
    .gte("date", since)
    .order("date", { ascending: true });

  const searchVolumeTrend = (keywordRows || [])
    .filter((r) => r.keyword === keyword) // 정확히 일치하는 키워드만 시계열로 (부분일치는 아래 게시물 검색에서 처리)
    .map((r) => ({ date: r.date, value: Number(r.value) }));

  // ── 관련 게시물: 캡션 또는 해시태그에 키워드가 포함된 SNS 게시물 ──
  const { data: postRows } = await db
    .from("trend_sns_posts")
    .select("*")
    .gte("collected_at", sinceTs)
    .order("collected_at", { ascending: false })
    .limit(500);

  const kw = keyword.toLowerCase();
  const matchedPosts = (postRows || []).filter((p) => {
    const caption = (p.caption || "").toLowerCase();
    const hashtags = (p.hashtags || []) as string[];
    return caption.includes(kw) || hashtags.some((h) => h.toLowerCase().includes(kw));
  });

  const platformCounts = {
    instagram: matchedPosts.filter((p) => p.platform === "instagram").length,
    youtube: matchedPosts.filter((p) => p.platform === "youtube").length,
  };

  const topPosts = [...matchedPosts]
    .sort((a, b) => (b.likes || 0) + (b.views || 0) - ((a.likes || 0) + (a.views || 0)))
    .slice(0, 5)
    .map((p) => ({
      id: p.id, url: p.url, platform: p.platform,
      caption: (p.caption || "").slice(0, 100),
      likes: p.likes || 0, comments: p.comments || 0, views: p.views || 0,
      postType: p.post_type || "기타", hospitalName: p.hospital_name || "",
    }));

  let aiSummary = "";
  let aiError: string | null = null;
  if (matchedPosts.length > 0 || searchVolumeTrend.length > 0) {
    try {
      aiSummary = await generateKeywordInsight({
        keyword,
        postCount: matchedPosts.length,
        platformCounts,
        topPosts: topPosts.map((p) => ({ caption: p.caption, platform: p.platform, likes: p.likes, comments: p.comments, views: p.views })),
        searchVolumeTrend,
      });
    } catch (err: any) {
      aiError = err?.message || "AI 분석 생성 실패";
    }
  }

  return NextResponse.json({
    ok: true,
    keyword,
    searchVolumeTrend,
    postCount: matchedPosts.length,
    platformCounts,
    topPosts,
    aiSummary,
    aiError,
  });
}
