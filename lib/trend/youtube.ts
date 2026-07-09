// YouTube Data API v3
// 필요 환경변수: YOUTUBE_API_KEY (Google Cloud Console에서 발급, YouTube Data API v3 활성화 필요)

export interface YoutubeVideoResult {
  videoId: string;
  title: string;
  channelTitle: string;
  publishedAt: string;
  viewCount: number;
  likeCount: number;
  isShort: boolean;
  thumbnailUrl: string;
}

export interface YoutubeChannelStats {
  channelId: string;
  title: string;
  subscriberCount: number;
  videoCount: number;
  viewCount: number;
}

export function youtubeKeyConfigured(): boolean {
  return !!process.env.YOUTUBE_API_KEY;
}

/** 키워드 기준 인기 영상(쇼츠 포함) 검색 */
export async function searchYoutubeTrending(
  keyword: string,
  opts: { maxResults?: number; publishedAfter?: string } = {}
): Promise<YoutubeVideoResult[]> {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) throw new Error("YOUTUBE_API_KEY 환경변수가 설정되지 않았습니다.");

  const maxResults = opts.maxResults ?? 10;
  const publishedAfter =
    opts.publishedAfter || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const searchUrl = new URL("https://www.googleapis.com/youtube/v3/search");
  searchUrl.searchParams.set("part", "snippet");
  searchUrl.searchParams.set("q", keyword);
  searchUrl.searchParams.set("type", "video");
  searchUrl.searchParams.set("order", "viewCount");
  searchUrl.searchParams.set("regionCode", "KR");
  searchUrl.searchParams.set("relevanceLanguage", "ko");
  searchUrl.searchParams.set("publishedAfter", publishedAfter);
  searchUrl.searchParams.set("maxResults", String(maxResults));
  searchUrl.searchParams.set("key", apiKey);

  const searchRes = await fetch(searchUrl.toString());
  if (!searchRes.ok) {
    const text = await searchRes.text().catch(() => "");
    throw new Error(`YouTube search API 오류 (${searchRes.status}): ${text}`);
  }
  const searchJson = await searchRes.json();
  const videoIds: string[] = (searchJson.items || [])
    .map((it: any) => it.id?.videoId)
    .filter(Boolean);
  if (videoIds.length === 0) return [];

  const statsUrl = new URL("https://www.googleapis.com/youtube/v3/videos");
  statsUrl.searchParams.set("part", "snippet,statistics,contentDetails");
  statsUrl.searchParams.set("id", videoIds.join(","));
  statsUrl.searchParams.set("key", apiKey);

  const statsRes = await fetch(statsUrl.toString());
  if (!statsRes.ok) {
    const text = await statsRes.text().catch(() => "");
    throw new Error(`YouTube videos API 오류 (${statsRes.status}): ${text}`);
  }
  const statsJson = await statsRes.json();

  return (statsJson.items || []).map((it: any) => {
    // ISO 8601 duration (예: PT58S) 60초 이하면 쇼츠로 간주
    const duration: string = it.contentDetails?.duration || "";
    const seconds = parseIsoDuration(duration);
    return {
      videoId: it.id,
      title: it.snippet?.title || "",
      channelTitle: it.snippet?.channelTitle || "",
      publishedAt: it.snippet?.publishedAt || "",
      viewCount: parseInt(it.statistics?.viewCount || "0", 10),
      likeCount: parseInt(it.statistics?.likeCount || "0", 10),
      isShort: seconds > 0 && seconds <= 60,
      thumbnailUrl: it.snippet?.thumbnails?.medium?.url || "",
    } as YoutubeVideoResult;
  });
}

/** 경쟁 병원 유튜브 채널 통계 조회 */
export async function fetchYoutubeChannelStats(channelId: string): Promise<YoutubeChannelStats | null> {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) throw new Error("YOUTUBE_API_KEY 환경변수가 설정되지 않았습니다.");

  const url = new URL("https://www.googleapis.com/youtube/v3/channels");
  url.searchParams.set("part", "snippet,statistics");
  url.searchParams.set("id", channelId);
  url.searchParams.set("key", apiKey);

  const res = await fetch(url.toString());
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`YouTube channels API 오류 (${res.status}): ${text}`);
  }
  const json = await res.json();
  const item = (json.items || [])[0];
  if (!item) return null;

  return {
    channelId,
    title: item.snippet?.title || "",
    subscriberCount: parseInt(item.statistics?.subscriberCount || "0", 10),
    videoCount: parseInt(item.statistics?.videoCount || "0", 10),
    viewCount: parseInt(item.statistics?.viewCount || "0", 10),
  };
}

function parseIsoDuration(iso: string): number {
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return 0;
  const h = parseInt(m[1] || "0", 10);
  const min = parseInt(m[2] || "0", 10);
  const s = parseInt(m[3] || "0", 10);
  return h * 3600 + min * 60 + s;
}
