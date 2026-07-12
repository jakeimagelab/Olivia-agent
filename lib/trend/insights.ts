// Claude API로 수집된 트렌드 데이터를 분석해 인사이트 코멘트를 생성한다.
// 기존 app/api/cron/weekly-report/route.ts 와 동일하게 Anthropic API를 직접 호출한다.

export interface TrendInsightInput {
  industry: string;
  periodStart: string;
  periodEnd: string;
  topKeywords: { keyword: string; value: number }[];
  hashtagRanking: { hashtag: string; count: number }[];
  competitorGrowth: { hospitalName: string; platform: string; followers: number; growthPct: number }[];
}

export interface TrendInsightResult {
  summary: string;
  highlights: string[];
}

export async function generateTrendInsight(input: TrendInsightInput): Promise<TrendInsightResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY 환경변수가 설정되지 않았습니다.");

  const prompt = `너는 병원 마케팅 트렌드 분석가야. 아래는 "${input.industry}" 업종의 ${input.periodStart} ~ ${input.periodEnd} 기간 수집 데이터야.

인기 검색 키워드 (검색량 지수 순):
${input.topKeywords.map((k) => `- ${k.keyword}: ${k.value}`).join("\n") || "(데이터 없음)"}

급상승 해시태그:
${input.hashtagRanking.map((h) => `- #${h.hashtag} (${h.count}건)`).join("\n") || "(데이터 없음)"}

경쟁 병원 SNS 성장률:
${
  input.competitorGrowth
    .map((c) => `- ${c.hospitalName} (${c.platform}): 팔로워 ${c.followers.toLocaleString()}, 증감 ${c.growthPct > 0 ? "+" : ""}${c.growthPct.toFixed(1)}%`)
    .join("\n") || "(데이터 없음)"
}

위 데이터를 바탕으로 병원 마케팅 담당자가 참고할 인사이트를 작성해줘. 다음 JSON 형식으로만 답해 (다른 텍스트 없이):
{
  "summary": "2~3문장 종합 요약",
  "highlights": ["실행 가능한 시사점 1", "실행 가능한 시사점 2", "실행 가능한 시사점 3"]
}`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-5",
      max_tokens: 800,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Claude API 오류 (${res.status}): ${text}`);
  }

  const json = await res.json();
  const text: string = json.content?.[0]?.text || "{}";
  const match = text.match(/\{[\s\S]*\}/);
  const parsed = match ? JSON.parse(match[0]) : { summary: text, highlights: [] };

  return {
    summary: parsed.summary || "",
    highlights: Array.isArray(parsed.highlights) ? parsed.highlights : [],
  };
}

export interface KeywordInsightInput {
  keyword: string;
  postCount: number;
  platformCounts: { instagram: number; youtube: number };
  topPosts: { caption: string; platform: string; likes: number; comments: number; views: number }[];
  searchVolumeTrend: { date: string; value: number }[];
}

/** 특정 키워드 하나에 대한 짧은 분석 코멘트를 생성한다. */
export async function generateKeywordInsight(input: KeywordInsightInput): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY 환경변수가 설정되지 않았습니다.");

  const volumeText = input.searchVolumeTrend.length
    ? input.searchVolumeTrend.map((p) => `${p.date}: ${p.value}`).join(", ")
    : "(검색량 데이터 없음)";

  const prompt = `너는 병원 마케팅 트렌드 분석가야. 키워드 "${input.keyword}"에 대한 아래 데이터를 보고 병원 마케팅 담당자에게 2~4문장으로 짧게 분석해줘 (다른 텍스트 없이 분석 내용만).

관련 SNS 게시물 수: ${input.postCount}건 (인스타그램 ${input.platformCounts.instagram}건, 유튜브 ${input.platformCounts.youtube}건)
검색량 추이: ${volumeText}
인기 게시물 예시:
${input.topPosts.map((p) => `- [${p.platform}] "${p.caption}" (좋아요 ${p.likes}, 댓글 ${p.comments}, 조회수 ${p.views})`).join("\n") || "(없음)"}

이 키워드가 지금 병원 콘텐츠 기획에 어떤 의미가 있는지, 어떤 콘텐츠 형태가 반응이 좋은지 위주로 답해줘.`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-5",
      max_tokens: 400,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Claude API 오류 (${res.status}): ${text}`);
  }

  const json = await res.json();
  return json.content?.[0]?.text?.trim() || "";
}
