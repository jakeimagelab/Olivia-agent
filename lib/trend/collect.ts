import { getSupabaseAdmin } from "@/lib/supabase";
import { DEFAULT_KEYWORDS_BY_INDUSTRY, TREND_INDUSTRIES } from "./constants";
import { fetchNaverKeywordTrend, naverKeysConfigured } from "./naverDatalab";
import { fetchGoogleTrend } from "./googleTrends";
import { fetchInstagramHashtagPosts, fetchInstagramProfileStats, apifyTokenConfigured } from "./instagramApify";
import { fetchYoutubeChannelStats, searchYoutubeTrending, youtubeKeyConfigured } from "./youtube";

type RunSource = "naver" | "youtube" | "google_trends" | "instagram";

async function withRunLog<T>(source: RunSource, fn: () => Promise<{ items: T[] }>) {
  const db = getSupabaseAdmin();
  const { data: run, error: insertErr } = await db
    .from("trend_collection_runs")
    .insert({ source, status: "running" })
    .select()
    .single();
  if (insertErr) {
    console.error(`[trend:${source}] trend_collection_runs insert 실패 (스키마 미적용 가능성):`, insertErr.message);
  }

  try {
    const { items } = await fn();
    console.log(`[trend:${source}] 수집 완료: ${items.length}건`);
    if (run) {
      const { error: updateErr } = await db
        .from("trend_collection_runs")
        .update({ status: "success", items_collected: items.length, finished_at: new Date().toISOString() })
        .eq("id", run.id);
      if (updateErr) console.error(`[trend:${source}] trend_collection_runs update 실패:`, updateErr.message);
    }
    return items;
  } catch (err: any) {
    console.error(`[trend:${source}] 수집 실패:`, err?.message || err);
    if (run) {
      await db
        .from("trend_collection_runs")
        .update({ status: "error", error_message: String(err?.message || err), finished_at: new Date().toISOString() })
        .eq("id", run.id);
    }
    return [] as T[];
  }
}

/** 업종별 기본 키워드에 대해 네이버 데이터랩 검색량을 수집해 저장한다. */
async function collectNaver() {
  if (!naverKeysConfigured()) {
    await withRunLog("naver", async () => {
      throw new Error("NAVER_CLIENT_ID / NAVER_CLIENT_SECRET 미설정 — 수집을 건너뜁니다.");
    });
    return;
  }

  const db = getSupabaseAdmin();
  const endDate = new Date().toISOString().slice(0, 10);
  const startDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  await withRunLog<any>("naver", async () => {
    const rows: any[] = [];
    for (const industry of TREND_INDUSTRIES) {
      const keywords = DEFAULT_KEYWORDS_BY_INDUSTRY[industry];
      const points = await fetchNaverKeywordTrend(keywords, { startDate, endDate, timeUnit: "week" });
      for (const p of points) {
        rows.push({
          keyword: p.keyword,
          industry,
          source: "naver",
          period: "week",
          date: p.date,
          value: p.value,
        });
      }
    }
    if (rows.length > 0) {
      await db.from("trend_keywords").upsert(rows, { onConflict: "keyword,source,period,date" });
    }
    return { items: rows };
  });
}

/** 업종별 기본 키워드에 대해 구글 트렌드 관심도를 수집해 저장한다. */
async function collectGoogleTrends() {
  const db = getSupabaseAdmin();

  await withRunLog<any>("google_trends", async () => {
    const rows: any[] = [];
    for (const industry of TREND_INDUSTRIES) {
      // 구글 트렌드는 비공식 엔드포인트라 과호출 시 차단될 수 있어 업종당 대표 키워드 1개만 조회
      const keyword = DEFAULT_KEYWORDS_BY_INDUSTRY[industry][0];
      try {
        const points = await fetchGoogleTrend(keyword, { timeframe: "today 3-m", geo: "KR" });
        for (const p of points) {
          rows.push({
            keyword: p.keyword,
            industry,
            source: "google",
            period: "day",
            date: p.date,
            value: p.value,
          });
        }
      } catch {
        // 개별 키워드 실패는 전체 수집을 막지 않음
      }
    }
    if (rows.length > 0) {
      await db.from("trend_keywords").upsert(rows, { onConflict: "keyword,source,period,date" });
    }
    return { items: rows };
  });
}

/** 등록된 경쟁 병원의 인스타그램 프로필 스냅샷 + 업종별 해시태그 게시물을 수집한다. */
async function collectInstagram() {
  if (!apifyTokenConfigured()) {
    await withRunLog("instagram", async () => {
      throw new Error("APIFY_TOKEN 미설정 — 수집을 건너뜁니다.");
    });
    return;
  }

  const db = getSupabaseAdmin();

  await withRunLog<any>("instagram", async () => {
    const rows: any[] = [];
    const today = new Date().toISOString().slice(0, 10);

    // 1) 업종별 해시태그 인기 게시물
    for (const industry of TREND_INDUSTRIES) {
      const hashtag = DEFAULT_KEYWORDS_BY_INDUSTRY[industry][0].replace(/\s+/g, "");
      try {
        const posts = await fetchInstagramHashtagPosts(hashtag, { resultsLimit: 15 });
        for (const p of posts) {
          rows.push({
            platform: "instagram",
            industry,
            post_type: p.type,
            external_id: p.id,
            url: p.url,
            caption: p.caption,
            hashtags: p.hashtags,
            likes: p.likesCount,
            comments: p.commentsCount,
            posted_at: p.timestamp || null,
          });
        }
      } catch {
        // 개별 해시태그 실패는 전체 수집을 막지 않음
      }
    }
    if (rows.length > 0) {
      await db.from("trend_sns_posts").insert(rows);
    }

    // 2) 등록된 경쟁 병원 프로필 스냅샷
    const { data: competitors } = await db
      .from("trend_competitors")
      .select("*")
      .eq("is_active", true)
      .not("instagram_handle", "eq", "");

    const snapshotRows: any[] = [];
    for (const c of competitors || []) {
      if (!c.instagram_handle) continue;
      try {
        const stats = await fetchInstagramProfileStats(c.instagram_handle);
        if (stats) {
          snapshotRows.push({
            competitor_id: c.id,
            platform: "instagram",
            followers: stats.followersCount,
            posts_count: stats.postsCount,
            avg_engagement: stats.recentAvgLikes,
            snapshot_date: today,
          });
        }
      } catch {
        // 개별 병원 실패는 전체 수집을 막지 않음
      }
    }
    if (snapshotRows.length > 0) {
      await db
        .from("trend_competitor_snapshots")
        .upsert(snapshotRows, { onConflict: "competitor_id,platform,snapshot_date" });
    }

    return { items: [...rows, ...snapshotRows] };
  });
}

/** 업종별 대표 키워드 유튜브 인기 영상 + 등록된 경쟁 병원 채널 스냅샷을 수집한다. */
async function collectYoutube() {
  if (!youtubeKeyConfigured()) {
    await withRunLog("youtube", async () => {
      throw new Error("YOUTUBE_API_KEY 미설정 — 수집을 건너뜁니다.");
    });
    return;
  }

  const db = getSupabaseAdmin();
  const today = new Date().toISOString().slice(0, 10);

  await withRunLog<any>("youtube", async () => {
    const rows: any[] = [];

    for (const industry of TREND_INDUSTRIES) {
      const keyword = DEFAULT_KEYWORDS_BY_INDUSTRY[industry][0];
      try {
        const videos = await searchYoutubeTrending(keyword, { maxResults: 10 });
        for (const v of videos) {
          rows.push({
            platform: "youtube",
            industry,
            hospital_name: v.channelTitle,
            post_type: v.isShort ? "쇼츠" : "롱폼",
            external_id: v.videoId,
            url: `https://www.youtube.com/watch?v=${v.videoId}`,
            caption: v.title,
            likes: v.likeCount,
            views: v.viewCount,
            posted_at: v.publishedAt || null,
          });
        }
      } catch {
        // 개별 키워드 실패는 전체 수집을 막지 않음
      }
    }
    if (rows.length > 0) {
      await db.from("trend_sns_posts").insert(rows);
    }

    const { data: competitors } = await db
      .from("trend_competitors")
      .select("*")
      .eq("is_active", true)
      .not("youtube_channel_id", "eq", "");

    const snapshotRows: any[] = [];
    for (const c of competitors || []) {
      if (!c.youtube_channel_id) continue;
      try {
        const stats = await fetchYoutubeChannelStats(c.youtube_channel_id);
        if (stats) {
          snapshotRows.push({
            competitor_id: c.id,
            platform: "youtube",
            followers: stats.subscriberCount,
            posts_count: stats.videoCount,
            avg_engagement: stats.viewCount,
            snapshot_date: today,
          });
        }
      } catch {
        // 개별 병원 실패는 전체 수집을 막지 않음
      }
    }
    if (snapshotRows.length > 0) {
      await db
        .from("trend_competitor_snapshots")
        .upsert(snapshotRows, { onConflict: "competitor_id,platform,snapshot_date" });
    }

    return { items: [...rows, ...snapshotRows] };
  });
}

/** 4개 소스 전체 수집을 병렬 실행한다. cron과 수동 트리거 API가 공유한다. */
export async function runTrendCollection() {
  await Promise.allSettled([collectNaver(), collectGoogleTrends(), collectInstagram(), collectYoutube()]);
}
