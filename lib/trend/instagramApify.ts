// 인스타그램 트렌드 수집 — Apify 액터 실행
// 필요 환경변수: APIFY_TOKEN (https://apify.com 계정에서 발급)
// 선택 환경변수: APIFY_HASHTAG_ACTOR_ID (기본값: apify/instagram-hashtag-scraper)
//              APIFY_PROFILE_ACTOR_ID  (기본값: apify/instagram-profile-scraper)

const DEFAULT_HASHTAG_ACTOR = "apify~instagram-hashtag-scraper";
const DEFAULT_PROFILE_ACTOR = "apify~instagram-profile-scraper";

export interface ApifyHashtagPost {
  id: string;
  url: string;
  caption: string;
  hashtags: string[];
  likesCount: number;
  commentsCount: number;
  timestamp: string;
  type: string; // Image | Video | Sidecar
}

export interface ApifyProfileStats {
  username: string;
  followersCount: number;
  postsCount: number;
  recentAvgLikes: number;
}

export function apifyTokenConfigured(): boolean {
  return !!process.env.APIFY_TOKEN;
}

async function runApifyActor(actorId: string, input: Record<string, unknown>): Promise<any[]> {
  const token = process.env.APIFY_TOKEN;
  if (!token) throw new Error("APIFY_TOKEN 환경변수가 설정되지 않았습니다.");

  const url = `https://api.apify.com/v2/acts/${actorId}/run-sync-get-dataset-items?token=${encodeURIComponent(
    token
  )}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Apify 액터(${actorId}) 실행 오류 (${res.status}): ${text}`);
  }
  return res.json();
}

/** 해시태그 기준 최근 인기 게시물 수집 */
export async function fetchInstagramHashtagPosts(
  hashtag: string,
  opts: { resultsLimit?: number } = {}
): Promise<ApifyHashtagPost[]> {
  const actorId = process.env.APIFY_HASHTAG_ACTOR_ID || DEFAULT_HASHTAG_ACTOR;
  const items = await runApifyActor(actorId, {
    hashtags: [hashtag],
    resultsLimit: opts.resultsLimit ?? 20,
  });

  return items.map((it: any) => ({
    id: it.id || it.shortCode || "",
    url: it.url || "",
    caption: it.caption || "",
    hashtags: it.hashtags || [],
    likesCount: it.likesCount ?? 0,
    commentsCount: it.commentsCount ?? 0,
    timestamp: it.timestamp || "",
    type: it.type || "Image",
  }));
}

/** 경쟁 병원 인스타그램 프로필 통계 수집 */
export async function fetchInstagramProfileStats(username: string): Promise<ApifyProfileStats | null> {
  const actorId = process.env.APIFY_PROFILE_ACTOR_ID || DEFAULT_PROFILE_ACTOR;
  const items = await runApifyActor(actorId, { usernames: [username] });
  const item = items[0];
  if (!item) return null;

  const recentPosts: any[] = item.latestPosts || item.posts || [];
  const recentAvgLikes =
    recentPosts.length > 0
      ? recentPosts.reduce((sum, p) => sum + (p.likesCount ?? 0), 0) / recentPosts.length
      : 0;

  return {
    username,
    followersCount: item.followersCount ?? 0,
    postsCount: item.postsCount ?? 0,
    recentAvgLikes: Math.round(recentAvgLikes),
  };
}
