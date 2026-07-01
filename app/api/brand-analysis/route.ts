import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 25;

function extractImportantText(html: string, url: string): string {
  // Strip script/style/comment blocks
  let clean = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ");

  const parts: string[] = [];

  // Title
  const titleM = clean.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (titleM) parts.push(`[제목] ${strip(titleM[1])}`);

  // Meta description
  const metaM =
    clean.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i) ||
    clean.match(/<meta[^>]+content=["']([^"']{10,300})["'][^>]+name=["']description["']/i);
  if (metaM) parts.push(`[메타설명] ${metaM[1]}`);

  // OG title / description
  const ogTitle = clean.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i);
  if (ogTitle) parts.push(`[OG제목] ${ogTitle[1]}`);
  const ogDesc = clean.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i);
  if (ogDesc) parts.push(`[OG설명] ${ogDesc[1]}`);

  // h1–h3 headings
  for (const m of clean.matchAll(/<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/gi)) {
    const t = strip(m[1]);
    if (t.length > 1 && t.length < 200) parts.push(`[제목] ${t}`);
  }

  // h4–h5 (section labels)
  for (const m of clean.matchAll(/<h[4-5][^>]*>([\s\S]*?)<\/h[4-5]>/gi)) {
    const t = strip(m[1]);
    if (t.length > 1 && t.length < 120) parts.push(`[소제목] ${t}`);
  }

  // Paragraphs
  for (const m of clean.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)) {
    const t = strip(m[1]);
    if (t.length > 5 && t.length < 600) parts.push(t);
  }

  // List items
  for (const m of clean.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)) {
    const t = strip(m[1]);
    if (t.length > 1 && t.length < 200) parts.push(`• ${t}`);
  }

  // Buttons / anchor text
  for (const m of clean.matchAll(/<(?:button|a)[^>]*>([\s\S]*?)<\/(?:button|a)>/gi)) {
    const t = strip(m[1]);
    if (t.length > 1 && t.length < 100) parts.push(`[버튼] ${t}`);
  }

  // Strong / em emphasis text
  for (const m of clean.matchAll(/<(?:strong|b|em)[^>]*>([\s\S]*?)<\/(?:strong|b|em)>/gi)) {
    const t = strip(m[1]);
    if (t.length > 2 && t.length < 150) parts.push(`[강조] ${t}`);
  }

  const combined = `=== 페이지: ${url} ===\n` + [...new Set(parts)].join("\n");
  return combined.slice(0, 12000);
}

function strip(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/\s+/g, " ").trim();
}

function extractLinks(html: string, baseUrl: string): string[] {
  try {
    const base = new URL(baseUrl);
    const seen = new Set<string>();
    const results: string[] = [];
    for (const m of html.matchAll(/href=["']([^"'#?][^"']*?)["']/g)) {
      try {
        const u = new URL(m[1], baseUrl);
        if (u.origin !== base.origin) continue;
        if (/\.(pdf|jpg|jpeg|png|gif|svg|zip|mp4|webp|ico)$/i.test(u.pathname)) continue;
        if (seen.has(u.href) || u.href === baseUrl) continue;
        seen.add(u.href);
        results.push(u.href);
      } catch { /* ignore malformed */ }
    }
    return results.slice(0, 8);
  } catch { return []; }
}

async function fetchPage(url: string, timeoutMs = 8000): Promise<string> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; BrandAnalyzer/1.0; +https://photoclinic.kr)",
        "Accept": "text/html,application/xhtml+xml",
        "Accept-Language": "ko-KR,ko;q=0.9,en;q=0.8",
      },
    });
    clearTimeout(t);
    if (!res.ok) return "";
    return await res.text();
  } catch {
    clearTimeout(t);
    return "";
  }
}

export async function POST(req: NextRequest) {
  let url: string, purpose: string, depth: string;
  try {
    const body = await req.json();
    url = body.url; purpose = body.purpose ?? "all"; depth = body.depth ?? "standard";
  } catch {
    return NextResponse.json({ ok: false, error: "요청 본문을 파싱할 수 없습니다" }, { status: 400 });
  }
  if (!url) return NextResponse.json({ ok: false, error: "URL이 필요합니다" }, { status: 400 });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "API 키가 설정되지 않았습니다" }, { status: 500 });

  let targetUrl = url.trim();
  if (!targetUrl.startsWith("http")) targetUrl = "https://" + targetUrl;

  // Fetch main page
  const mainHtml = await fetchPage(targetUrl);
  if (!mainHtml) {
    return NextResponse.json({ error: "해당 페이지에 접근할 수 없습니다. URL을 확인해주세요." }, { status: 400 });
  }

  let allText = extractImportantText(mainHtml, targetUrl);

  // Fetch sub-pages (1-level deep)
  if (depth !== "simple") {
    const subLinks = extractLinks(mainHtml, targetUrl).slice(0, 4);
    const subResults = await Promise.all(
      subLinks.map(async (link) => {
        const html = await fetchPage(link, 5000);
        if (!html || html.length < 500) return "";
        return extractImportantText(html, link).slice(0, 3000);
      })
    );
    for (const sub of subResults) {
      if (sub.length > 100) allText += "\n\n" + sub;
    }
  }

  // Hard limit for Claude input
  allText = allText.slice(0, 22000);

  const purposeKo: Record<string, string> = {
    brand_film: "브랜드필름 제작",
    photo: "사진촬영 기획",
    proposal: "제안서 작성",
    sns: "SNS 콘텐츠 기획",
    all: "전체 종합 분석",
  };

  const prompt = `당신은 포토클리닉 전속 AI 에이전트 올리비아입니다.
병원/브랜드 홈페이지 텍스트를 분석하여 촬영 기획에 바로 활용할 수 있는 브랜드 분석 리포트를 생성합니다.

분석 목적: ${purposeKo[purpose] ?? purpose}
분석 URL: ${targetUrl}

--- 수집된 홈페이지 텍스트 ---
${allText}
--- 텍스트 끝 ---

위 내용을 촬영 기획 관점에서 분석하여 아래 JSON 형식으로만 응답하세요. JSON 외 다른 텍스트는 절대 포함하지 마세요.

{
  "brandName": "병원/브랜드 공식 명칭",
  "oneLiner": "이 브랜드를 한 문장으로 요약 (60자 이내, 촬영 기획 관점)",
  "topKeywords": ["키워드1","키워드2","키워드3","키워드4","키워드5","키워드6","키워드7","키워드8","키워드9","키워드10"],
  "mainMessage": "홈페이지에서 가장 강하게 전달되는 핵심 메시지 2-3문장",
  "shootingDirection": "공간형|인물형|시술형|웰니스형|복합형",
  "shootingDirectionReason": "해당 촬영 방향을 추천하는 구체적 이유 (2-3문장)",
  "contentDirections": {
    "brandFilm": "브랜드필름 촬영 방향과 분위기 (2-3문장)",
    "photo": "스틸사진 촬영 방향과 주요 컷 (2-3문장)",
    "sns": "SNS 콘텐츠 활용 방향과 키워드 (2-3문장)"
  },
  "keywordGroups": [
    { "category": "브랜드 철학", "keywords": ["키워드1","키워드2","키워드3"], "interpretation": "촬영 기획 관점 해석 (1-2문장)", "usage": "실제 촬영/편집 활용 방향" },
    { "category": "서비스·시술", "keywords": ["키워드1","키워드2","키워드3"], "interpretation": "촬영 기획 관점 해석", "usage": "실제 촬영/편집 활용 방향" },
    { "category": "공간·감성", "keywords": ["키워드1","키워드2","키워드3"], "interpretation": "촬영 기획 관점 해석", "usage": "실제 촬영/편집 활용 방향" },
    { "category": "신뢰·의료", "keywords": ["키워드1","키워드2","키워드3"], "interpretation": "촬영 기획 관점 해석", "usage": "실제 촬영/편집 활용 방향" },
    { "category": "고객 경험", "keywords": ["키워드1","키워드2","키워드3"], "interpretation": "촬영 기획 관점 해석", "usage": "실제 촬영/편집 활용 방향" }
  ],
  "serviceCategories": [
    { "category": "카테고리명", "webWording": "홈페이지 원문 표현", "meaning": "시술/서비스 의미", "shootingUsage": "촬영 활용 방법" }
  ],
  "brandFilmLines": [
    { "usage": "오프닝 자막", "line": "브랜드필름 오프닝에 사용할 문장" },
    { "usage": "중반 자막", "line": "중반부 전환 문장" },
    { "usage": "상담 파트", "line": "상담 장면에 어울리는 문장" },
    { "usage": "케어 파트", "line": "시술/케어 장면에 어울리는 문장" },
    { "usage": "엔딩 문구", "line": "브랜드 엔딩 문장" }
  ],
  "photoConti": [
    { "scene": "장면명", "shots": "필요한 구체적 컷 설명", "reason": "해당 컷이 필요한 이유" }
  ],
  "adRisks": [
    { "type": "위험 유형", "example": "홈페이지에서 발견된 실제 위험 표현 또는 유사 표현", "fix": "안전한 수정 방향" }
  ]
}

adRisks에서 홈페이지에 위험 표현이 없다면 빈 배열 []로 반환하세요.
photoConti는 최소 5개, 최대 8개 장면을 제안하세요.
serviceCategories는 홈페이지에서 실제로 발견된 서비스/시술 카테고리만 포함하세요.`;

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 4096,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    const data = await res.json();
    if (data.error) throw new Error(data.error.message ?? "API 오류");
    const text: string = data.content?.[0]?.text ?? "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("분석 결과를 파싱할 수 없습니다");
    const result = JSON.parse(jsonMatch[0]);
    return NextResponse.json({ ok: true, url: targetUrl, purpose: purposeKo[purpose] ?? purpose, ...result });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message ?? "분석에 실패했습니다" }, { status: 500 });
  }
}
