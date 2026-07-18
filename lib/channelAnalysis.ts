import { isIP } from "node:net";
import { lookup } from "node:dns/promises";
import { CHANNELS, type ChannelAnalysisResult, type ChannelKey, type ChannelResult, type ChannelUrls, type Finding } from "@/lib/channelAnalysisTypes";

type PageSnapshot = {
  url: string; ok: boolean; title: string; description: string; headings: string[];
  imageCount: number; altCount: number; textLength: number; hasJsonLd: boolean;
  hasFaq: boolean; internalLinks: number; error?: string;
};

type InstagramSnapshot = {
  ok: boolean; postCount: number; avgLikes: number | null; avgComments: number | null;
  engagementRate: number | null; captions: string[]; actorCount: number; error?: string;
};

const EMPTY_RESULT: ChannelResult = { score: 0, status: "미입력", findings: [] };

function cleanText(value: unknown, max = 500) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

function isPrivateIp(address: string) {
  const normalized = address.replace(/^::ffff:/, "").toLowerCase();
  if (["::1", "0.0.0.0", "127.0.0.1"].includes(normalized)) return true;
  if (normalized.startsWith("10.") || normalized.startsWith("127.") || normalized.startsWith("169.254.")) return true;
  if (normalized.startsWith("192.168.")) return true;
  const parts = normalized.split(".").map(Number);
  if (parts.length === 4 && parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
  return normalized.startsWith("fc") || normalized.startsWith("fd") || normalized.startsWith("fe80:");
}

export async function assertSafeChannelUrl(raw: string) {
  const url = new URL(raw);
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error("http/https URL만 분석할 수 있습니다.");
  const hostname = url.hostname.toLowerCase();
  if (!hostname || hostname === "localhost" || hostname.endsWith(".local")) throw new Error("내부 주소는 분석할 수 없습니다.");
  if (isIP(hostname)) {
    if (isPrivateIp(hostname)) throw new Error("사설 네트워크 주소는 분석할 수 없습니다.");
  } else {
    const addresses = await lookup(hostname, { all: true });
    if (!addresses.length || addresses.some((item) => isPrivateIp(item.address))) throw new Error("안전하지 않은 네트워크 주소입니다.");
  }
  return url;
}

export function normalizeChannelUrls(input: Partial<Record<ChannelKey, string>>): ChannelUrls {
  const normalized = {} as ChannelUrls;
  for (const channel of CHANNELS) {
    const raw = cleanText(input[channel.key], 600);
    if (!raw) { normalized[channel.key] = ""; continue; }
    if (channel.key === "insta" && raw.startsWith("@")) normalized[channel.key] = `https://www.instagram.com/${raw.slice(1)}/`;
    else normalized[channel.key] = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  }
  return normalized;
}

async function safeFetchHtml(rawUrl: string, redirects = 0): Promise<{ html: string; finalUrl: string }> {
  if (redirects > 4) throw new Error("리다이렉트가 너무 많습니다.");
  const url = await assertSafeChannelUrl(rawUrl);
  const response = await fetch(url, {
    redirect: "manual",
    signal: AbortSignal.timeout(12_000),
    headers: {
      "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/124 Safari/537.36",
      accept: "text/html,application/xhtml+xml",
      "accept-language": "ko-KR,ko;q=0.9",
    },
  });
  if ([301,302,303,307,308].includes(response.status)) {
    const location = response.headers.get("location");
    if (!location) throw new Error("잘못된 리다이렉트 응답입니다.");
    return safeFetchHtml(new URL(location, url).toString(), redirects + 1);
  }
  if (!response.ok) throw new Error(`페이지 수집 실패 (${response.status})`);
  const type = response.headers.get("content-type") || "";
  if (!type.includes("text/html")) throw new Error("HTML 페이지가 아닙니다.");
  const html = (await response.text()).slice(0, 2_000_000);
  return { html, finalUrl: url.toString() };
}

function stripHtml(html: string) {
  return html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
}

function meta(html: string, key: string) {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const patterns = [
    new RegExp(`<meta[^>]+(?:name|property)=["']${escaped}["'][^>]+content=["']([^"']+)["']`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:name|property)=["']${escaped}["']`, "i"),
  ];
  for (const pattern of patterns) { const match = html.match(pattern); if (match?.[1]) return cleanText(match[1], 300); }
  return "";
}

async function collectPage(url: string): Promise<PageSnapshot | null> {
  if (!url) return null;
  try {
    const { html, finalUrl } = await safeFetchHtml(url);
    const title = cleanText(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1], 180);
    const headings = [...html.matchAll(/<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/gi)].slice(0, 12).map((match) => cleanText(stripHtml(match[1]), 160)).filter(Boolean);
    const images = [...html.matchAll(/<img\b[^>]*>/gi)];
    const altCount = images.filter((match) => /\balt=["'][^"']+["']/i.test(match[0])).length;
    const origin = new URL(finalUrl).origin;
    const internalLinks = [...html.matchAll(/<a\b[^>]+href=["']([^"']+)["']/gi)].filter((match) => {
      try { return new URL(match[1], finalUrl).origin === origin; } catch { return false; }
    }).length;
    return {
      url: finalUrl, ok: true, title, description: meta(html, "description") || meta(html, "og:description"), headings,
      imageCount: images.length, altCount, textLength: stripHtml(html).length,
      hasJsonLd: /application\/ld\+json/i.test(html), hasFaq: /FAQPage|자주\s*묻는\s*질문/i.test(html), internalLinks,
    };
  } catch (error) {
    return { url, ok: false, title: "", description: "", headings: [], imageCount: 0, altCount: 0, textLength: 0, hasJsonLd: false, hasFaq: false, internalLinks: 0, error: error instanceof Error ? error.message : String(error) };
  }
}

function actorEndpoint(actorId: string) {
  return `https://api.apify.com/v2/acts/${actorId.replace('/', '~')}/run-sync-get-dataset-items`;
}

async function collectInstagram(url: string): Promise<InstagramSnapshot | null> {
  if (!url) return null;
  await assertSafeChannelUrl(url);
  const token = process.env.APIFY_TOKEN;
  if (!token) return { ok: false, postCount: 0, avgLikes: null, avgComments: null, engagementRate: null, captions: [], actorCount: 0, error: "APIFY_TOKEN 미설정" };
  const actors = [
    process.env.APIFY_INSTAGRAM_SCRAPER_ACTOR_ID || "apify/instagram-scraper",
    process.env.APIFY_INSTAGRAM_POST_SCRAPER_ACTOR_ID || "apify/instagram-post-scraper",
    process.env.APIFY_INSTAGRAM_PROFILE_SCRAPER_ACTOR_ID || "apify/instagram-profile-scraper",
  ];
  const limit = Math.max(6, Math.min(30, Number(process.env.APIFY_INSTAGRAM_LIMIT || 18)));
  const settled = await Promise.allSettled(actors.map(async (actorId) => {
    const response = await fetch(`${actorEndpoint(actorId)}?token=${encodeURIComponent(token)}&format=json&clean=true`, {
      method: "POST", signal: AbortSignal.timeout(55_000), headers: { "content-type": "application/json" },
      body: JSON.stringify({ directUrls: [url], urls: [url], resultsLimit: limit, resultsType: "posts" }),
    });
    if (!response.ok) throw new Error(`${actorId}: ${response.status}`);
    return await response.json() as any[];
  }));
  const items = settled.flatMap((result) => result.status === "fulfilled" && Array.isArray(result.value) ? result.value : []);
  const unique = new Map<string, any>();
  for (const item of items) unique.set(String(item.url || item.shortCode || item.id || unique.size), item);
  const posts = [...unique.values()].filter((item) => item.caption || item.likesCount != null || item.commentsCount != null);
  const likes = posts.map((item) => Number(item.likesCount ?? item.likes ?? 0)).filter(Number.isFinite);
  const comments = posts.map((item) => Number(item.commentsCount ?? item.comments ?? 0)).filter(Number.isFinite);
  const followers = Number(items.find((item) => item.followersCount || item.followers)?.followersCount ?? items.find((item) => item.followers)?.followers ?? 0);
  const avgLikes = likes.length ? likes.reduce((a,b) => a+b, 0) / likes.length : null;
  const avgComments = comments.length ? comments.reduce((a,b) => a+b, 0) / comments.length : null;
  const engagementRate = followers > 0 && avgLikes != null ? ((avgLikes + (avgComments || 0)) / followers) * 100 : null;
  return { ok: posts.length > 0, postCount: posts.length, avgLikes, avgComments, engagementRate, captions: posts.map((item) => cleanText(item.caption, 800)).filter(Boolean).slice(0, limit), actorCount: settled.filter((item) => item.status === "fulfilled").length, error: posts.length ? undefined : "인스타그램 게시물을 수집하지 못했습니다." };
}

function scorePage(snapshot: PageSnapshot | null, label: string): ChannelResult {
  if (!snapshot) return { ...EMPTY_RESULT };
  if (!snapshot.ok) return { score: 0, status: "수집 실패", findings: [{ type: "issue", text: `${label}: ${snapshot.error || "페이지 수집 실패"}` }] };
  let score = 20;
  const findings: Finding[] = [];
  const checks = [
    [Boolean(snapshot.title), 14, "검색 제목이 확인됩니다.", "검색 제목을 정리하세요."],
    [Boolean(snapshot.description), 14, "검색 설명문이 있습니다.", "메타 설명문을 추가하세요."],
    [snapshot.headings.length > 0, 12, "콘텐츠 제목 구조가 있습니다.", "H1·H2 제목 구조를 보강하세요."],
    [snapshot.imageCount > 0 && snapshot.altCount / snapshot.imageCount >= .5, 12, "이미지 대체텍스트가 관리됩니다.", "사진 ALT 설명을 보강하세요."],
    [snapshot.hasJsonLd, 12, "구조화 데이터가 확인됩니다.", "병원·의료기관 구조화 데이터를 추가하세요."],
    [snapshot.textLength >= 900, 10, "충분한 설명 콘텐츠가 있습니다.", "진료·의료진 설명 콘텐츠를 확장하세요."],
    [snapshot.internalLinks >= 5, 6, "내부 이동 구조가 연결돼 있습니다.", "진료과·의료진·예약 페이지를 내부 링크로 연결하세요."],
  ] as const;
  for (const [ok, points, good, issue] of checks) { if (ok) { score += points; findings.push({ type: "good", text: good }); } else findings.push({ type: "issue", text: issue }); }
  return { score: Math.min(100, score), status: score >= 75 ? "양호" : score >= 50 ? "보완 필요" : "집중 개선", findings: findings.slice(0, 6), detail: snapshot as unknown as Record<string, unknown> };
}

function scoreInstagram(snapshot: InstagramSnapshot | null): ChannelResult {
  if (!snapshot) return { ...EMPTY_RESULT };
  if (!snapshot.ok) return { score: 0, status: "수집 실패", findings: [{ type: "issue", text: snapshot.error || "인스타그램 수집 실패" }] };
  let score = 30;
  const findings: Finding[] = [];
  if (snapshot.postCount >= 12) { score += 24; findings.push({ type: "good", text: "최근 콘텐츠 표본이 충분합니다." }); }
  else findings.push({ type: "issue", text: "정기적인 게시물 발행이 필요합니다." });
  if ((snapshot.engagementRate || 0) >= 1) { score += 22; findings.push({ type: "good", text: "팔로워 대비 반응률이 양호합니다." }); }
  else findings.push({ type: "tip", text: "의료진 설명·전후 맥락·상담 CTA 콘텐츠를 강화하세요." });
  const joined = snapshot.captions.join(" ");
  if (/원장|의료진|상담|진료/.test(joined)) { score += 14; findings.push({ type: "good", text: "의료진과 상담 맥락이 콘텐츠에 포함됩니다." }); }
  if (/예약|문의|상담/.test(joined)) score += 10;
  return { score: Math.min(100, score), status: score >= 75 ? "양호" : score >= 50 ? "보완 필요" : "집중 개선", findings, detail: snapshot as unknown as Record<string, unknown> };
}

async function polishSummary(hospitalName: string, result: ChannelAnalysisResult) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return result;
  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST", signal: AbortSignal.timeout(20_000),
      headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: process.env.ANTHROPIC_MODEL || "claude-sonnet-4-20250514", max_tokens: 500,
        messages: [{ role: "user", content: `${hospitalName}의 병원 채널 분석 결과를 대표가 바로 이해할 수 있도록 한국어 2문장으로 요약하세요. 점수 ${result.overall_score}, 채널 결과 ${JSON.stringify(result.channels)}` }] }),
    });
    if (!response.ok) return result;
    const json = await response.json();
    const text = cleanText(json.content?.find((item: any) => item.type === "text")?.text, 700);
    return text ? { ...result, overall_summary: text } : result;
  } catch { return result; }
}

export async function analyzeChannels(input: { hospitalName: string; specialty?: string; urls: Partial<Record<ChannelKey,string>> }) {
  const urls = normalizeChannelUrls(input.urls);
  const active = CHANNELS.map((channel) => channel.key).filter((key) => urls[key]) as ChannelKey[];
  if (!active.length) throw new Error("분석할 URL을 하나 이상 입력해주세요.");
  await Promise.all(active.map((key) => assertSafeChannelUrl(urls[key])));
  const [insta, web, naver, blog] = await Promise.all([collectInstagram(urls.insta), collectPage(urls.web), collectPage(urls.naver), collectPage(urls.blog)]);
  const channels: Record<ChannelKey, ChannelResult> = {
    insta: scoreInstagram(insta), web: scorePage(web, "홈페이지"), naver: scorePage(naver, "네이버 플레이스"), blog: scorePage(blog, "블로그"),
  };
  const activeWeight = CHANNELS.filter((channel) => active.includes(channel.key)).reduce((sum, channel) => sum + channel.weight, 0);
  const overall = Math.round(CHANNELS.filter((channel) => active.includes(channel.key)).reduce((sum, channel) => sum + channels[channel.key].score * channel.weight, 0) / activeWeight);
  const issues = active.flatMap((key) => channels[key].findings.filter((item) => item.type === "issue").map((item) => item.text)).slice(0, 8);
  const result: ChannelAnalysisResult = {
    overall_score: overall,
    overall_summary: `${input.hospitalName || "분석 대상 병원"}의 ${active.length}개 채널 종합 점수는 ${overall}점입니다. 강점은 유지하고 점수가 낮은 채널의 검색 정보와 의료진 신뢰 콘텐츠를 먼저 보완하세요.`,
    photo_opportunity: "의료진 설명 장면, 상담 과정, 공간·장비의 사용 맥락을 한 촬영에서 함께 확보하면 네 채널에 반복 활용할 수 있습니다.",
    channels, analyzed_channels: active,
    coverage_summary: active.map((key) => CHANNELS.find((item) => item.key === key)?.label).join(" · "),
    seo_insights: issues,
    instagram_metrics: insta ? { post_count: insta.postCount, avg_likes: insta.avgLikes, avg_comments: insta.avgComments, engagement_rate: insta.engagementRate } : null,
    report_sections: [
      { title: "우선 개선", items: issues.length ? issues : ["현재 수집 범위에서 긴급한 개선 항목은 없습니다."] },
      { title: "추천 촬영 구성", items: ["의료진 프로필과 설명 컷", "상담 흐름과 환자 동선", "공간·장비 사용 장면", "예약·문의 CTA용 세로 이미지"] },
    ],
    package_recommendation: { name: "4채널 브랜드 콘텐츠 패키지", reason: "한 번의 촬영으로 홈페이지·플레이스·블로그·인스타그램 소재를 함께 확보합니다.", items: ["의료진", "상담", "공간", "장비", "세로형 SNS"] },
    collection_summary: { instagram: insta, web, naver, blog },
  };
  return { urls, result: await polishSummary(input.hospitalName, result) };
}

export async function benchmarkHospitals(input: { hospitalName: string; specialty: string; address: string }) {
  const clientId = process.env.NAVER_CLIENT_ID;
  const clientSecret = process.env.NAVER_CLIENT_SECRET;
  if (!clientId || !clientSecret) return { hospitals: [], insights: ["NAVER_CLIENT_ID와 NAVER_CLIENT_SECRET을 설정하면 주변 병원 벤치마킹을 사용할 수 있습니다."], strategy: "현재 채널 분석 결과를 우선 활용하세요.", naverApiEnabled: false };
  const query = cleanText(`${input.address} ${input.specialty}`, 180);
  const response = await fetch(`https://openapi.naver.com/v1/search/local.json?query=${encodeURIComponent(query)}&display=8&sort=comment`, {
    headers: { "X-Naver-Client-Id": clientId, "X-Naver-Client-Secret": clientSecret }, signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) throw new Error(`네이버 지역검색 실패 (${response.status})`);
  const json = await response.json();
  const hospitals = (json.items || []).map((item: any) => ({ name: cleanText(item.title?.replace(/<[^>]+>/g, ""), 100), address: cleanText(item.roadAddress || item.address, 180), phone: cleanText(item.telephone, 40), category: cleanText(item.category, 100), naverUrl: cleanText(item.link, 500) })).filter((item: any) => item.name && item.name !== input.hospitalName);
  return { hospitals, insights: [`${query} 기준 주변 병원 ${hospitals.length}곳을 확인했습니다.`, "상위 병원의 의료진·진료·리뷰 콘텐츠 구조를 비교하세요."], strategy: "경쟁 병원이 부족하게 보여주는 의료진 설명과 상담 경험을 사진으로 선점하세요.", naverApiEnabled: true };
}
