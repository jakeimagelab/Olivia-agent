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
