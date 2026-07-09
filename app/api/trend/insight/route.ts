import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { generateTrendInsight } from "@/lib/trend/insights";
import { industryOrDefault } from "@/lib/trend/constants";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const industryParam = body.industry as string | undefined;
  const isAll = !industryParam || industryParam === "all";
  const industryLabel = isAll ? "전체" : industryOrDefault(industryParam);

  const db = getSupabaseAdmin();
  const periodEnd = new Date();
  const periodStart = new Date(periodEnd.getTime() - 14 * 24 * 60 * 60 * 1000);
  const periodStartStr = periodStart.toISOString().slice(0, 10);
  const periodEndStr = periodEnd.toISOString().slice(0, 10);

  let keywordQuery = db
    .from("trend_keywords")
    .select("*")
    .gte("date", periodStartStr)
    .order("date", { ascending: false });
  if (!isAll) keywordQuery = keywordQuery.eq("industry", industryLabel);
  const { data: keywordRows } = await keywordQuery;

  let postsQuery = db
    .from("trend_sns_posts")
    .select("*")
    .gte("collected_at", periodStart.toISOString());
  if (!isAll) postsQuery = postsQuery.eq("industry", industryLabel);
  const { data: postRows } = await postsQuery;

  let competitorsQuery = db.from("trend_competitors").select("*").eq("is_active", true);
  if (!isAll) competitorsQuery = competitorsQuery.eq("industry", industryLabel);
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

  const topKeywordsMap = new Map<string, number>();
  for (const row of keywordRows || []) {
    topKeywordsMap.set(row.keyword, Math.max(topKeywordsMap.get(row.keyword) || 0, Number(row.value)));
  }
  const topKeywords = [...topKeywordsMap.entries()]
    .map(([keyword, value]) => ({ keyword, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 8);

  const hashtagCounts = new Map<string, number>();
  for (const post of postRows || []) {
    for (const tag of post.hashtags || []) hashtagCounts.set(tag, (hashtagCounts.get(tag) || 0) + 1);
  }
  const hashtagRanking = [...hashtagCounts.entries()]
    .map(([hashtag, count]) => ({ hashtag, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);

  const competitorGrowth = (competitors || []).flatMap((c) => {
    return ["instagram", "youtube"].map((platform) => {
      const rows = snapshots.filter((s) => s.competitor_id === c.id && s.platform === platform);
      const latest = rows[0];
      const prev = rows[1];
      if (!latest) return null;
      const growthPct = prev && prev.followers > 0 ? ((latest.followers - prev.followers) / prev.followers) * 100 : 0;
      return { hospitalName: c.hospital_name, platform, followers: latest.followers, growthPct };
    });
  }).filter(Boolean) as { hospitalName: string; platform: string; followers: number; growthPct: number }[];

  const result = await generateTrendInsight({
    industry: industryLabel,
    periodStart: periodStartStr,
    periodEnd: periodEndStr,
    topKeywords,
    hashtagRanking,
    competitorGrowth,
  });

  const { data: saved } = await db
    .from("trend_insights")
    .insert({
      industry: industryLabel,
      period_start: periodStartStr,
      period_end: periodEndStr,
      summary: result.summary,
      highlights: result.highlights,
    })
    .select()
    .single();

  return NextResponse.json({ ok: true, insight: saved });
}
