import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { industryOrDefault } from "@/lib/trend/constants";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const industryParam = searchParams.get("industry"); // null/"all" = 전체
  const isAll = !industryParam || industryParam === "all";
  const industry = isAll ? null : industryOrDefault(industryParam);

  const db = getSupabaseAdmin();
  const since = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const sinceTs = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();

  // ── 키워드 시계열 ──
  let keywordQuery = db.from("trend_keywords").select("*").gte("date", since).order("date", { ascending: true });
  if (industry) keywordQuery = keywordQuery.eq("industry", industry);
  const { data: keywordRows } = await keywordQuery;

  // ── SNS 게시물 ──
  let postsQuery = db
    .from("trend_sns_posts")
    .select("*")
    .gte("collected_at", sinceTs)
    .order("collected_at", { ascending: false });
  if (industry) postsQuery = postsQuery.eq("industry", industry);
  const { data: postRows } = await postsQuery;

  // ── 경쟁 병원 + 최근 2개 스냅샷 ──
  let competitorsQuery = db.from("trend_competitors").select("*").eq("is_active", true);
  if (industry) competitorsQuery = competitorsQuery.eq("industry", industry);
  const { data: competitors } = await competitorsQuery;

  const competitorIds = (competitors || []).map((c) => c.id);
  let snapshots: any[] = [];
  if (competitorIds.length > 0) {
    const { data } = await db
      .from("trend_competitor_snapshots")
      .select("*")
      .in("competitor_id", competitorIds)
      .order("snapshot_date", { ascending: false });
    snapshots = data || [];
  }

  // ── 최신 AI 인사이트 ──
  const { data: insightRows } = await db
    .from("trend_insights")
    .select("*")
    .eq("industry", industry || "전체")
    .order("created_at", { ascending: false })
    .limit(1);

  // ── 가공: 키워드 시계열 (키워드별 그룹, 날짜순 정렬) ──
  const keywordSeries: Record<string, { date: string; value: number }[]> = {};
  for (const row of keywordRows || []) {
    if (!keywordSeries[row.keyword]) keywordSeries[row.keyword] = [];
    keywordSeries[row.keyword].push({ date: row.date, value: Number(row.value) });
  }

  // ── 가공: 인기 키워드 TOP5 (최신 검색량 기준) ──
  const topKeywords = Object.entries(keywordSeries)
    .map(([keyword, points]) => ({ keyword, value: points[points.length - 1]?.value ?? 0 }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 5);

  // ── 가공: 급상승 키워드 TOP5 (기간 내 첫 값 대비 마지막 값 증감률) ──
  const risingKeywords = Object.entries(keywordSeries)
    .map(([keyword, points]) => {
      const first = points[0]?.value ?? 0;
      const last = points[points.length - 1]?.value ?? 0;
      const growthPct = first > 0 ? ((last - first) / first) * 100 : last > 0 ? 100 : 0;
      return { keyword, value: last, growthPct };
    })
    .filter((k) => k.value > 0)
    .sort((a, b) => b.growthPct - a.growthPct)
    .slice(0, 5);

  // ── 가공: 해시태그 랭킹 ──
  const hashtagCounts = new Map<string, number>();
  for (const post of postRows || []) {
    for (const tag of post.hashtags || []) {
      hashtagCounts.set(tag, (hashtagCounts.get(tag) || 0) + 1);
    }
  }
  const hashtagRanking = [...hashtagCounts.entries()]
    .map(([hashtag, count]) => ({ hashtag, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 15);

  // ── 가공: 플랫폼별 게시물 유형 분포 + 참여 지표 ──
  const buildPlatformBreakdown = (platform: "instagram" | "youtube") => {
    const posts = (postRows || []).filter((p) => p.platform === platform);
    const typeCounts = new Map<string, number>();
    let likesSum = 0, commentsSum = 0, viewsSum = 0;
    for (const post of posts) {
      const t = post.post_type || "기타";
      typeCounts.set(t, (typeCounts.get(t) || 0) + 1);
      likesSum += post.likes || 0;
      commentsSum += post.comments || 0;
      viewsSum += post.views || 0;
    }
    return {
      postCount: posts.length,
      typeBreakdown: [...typeCounts.entries()].map(([type, count]) => ({ type, count })),
      avgLikes: posts.length ? Math.round(likesSum / posts.length) : 0,
      avgComments: posts.length ? Math.round(commentsSum / posts.length) : 0,
      avgViews: posts.length ? Math.round(viewsSum / posts.length) : 0,
      topPosts: [...posts]
        .sort((a, b) => (b.likes || 0) + (b.views || 0) - ((a.likes || 0) + (a.views || 0)))
        .slice(0, 5)
        .map((p) => ({
          id: p.id, url: p.url, caption: (p.caption || "").slice(0, 80),
          likes: p.likes || 0, comments: p.comments || 0, views: p.views || 0,
          postType: p.post_type || "기타", hospitalName: p.hospital_name || "",
        })),
    };
  };
  const postBreakdownByPlatform = {
    instagram: buildPlatformBreakdown("instagram"),
    youtube: buildPlatformBreakdown("youtube"),
  };

  // ── 가공: 경쟁사 성장률 비교 테이블 ──
  const competitorTable = (competitors || []).map((c) => {
    const rows = snapshots.filter((s) => s.competitor_id === c.id);
    const byPlatform = (platform: string) => rows.filter((r) => r.platform === platform);
    const buildRow = (platform: string) => {
      const ps = byPlatform(platform);
      const latest = ps[0];
      const prev = ps[1];
      if (!latest) return null;
      const growthPct = prev && prev.followers > 0 ? ((latest.followers - prev.followers) / prev.followers) * 100 : 0;
      return {
        platform,
        followers: latest.followers,
        postsCount: latest.posts_count,
        avgEngagement: latest.avg_engagement,
        growthPct,
        snapshotDate: latest.snapshot_date,
      };
    };
    return {
      id: c.id,
      hospitalName: c.hospital_name,
      industry: c.industry,
      instagram: buildRow("instagram"),
      youtube: buildRow("youtube"),
    };
  });

  // ── 주목할 병원: 인스타 팔로워 성장률 1위 ──
  const hospitalToWatch = competitorTable
    .map((c) => ({ name: c.hospitalName, growthPct: c.instagram?.growthPct ?? c.youtube?.growthPct ?? 0 }))
    .sort((a, b) => b.growthPct - a.growthPct)[0];

  return NextResponse.json({
    industry: industry || "전체",
    summary: {
      topKeyword: topKeywords[0]?.keyword || null,
      risingHashtag: hashtagRanking[0]?.hashtag || null,
      hospitalToWatch: hospitalToWatch?.name || null,
    },
    keywordSeries,
    topKeywords,
    risingKeywords,
    hashtagRanking,
    postBreakdownByPlatform,
    competitorTable,
    latestInsight: insightRows?.[0] || null,
    dataAvailable: (keywordRows?.length || 0) + (postRows?.length || 0) + snapshots.length > 0,
  });
}
