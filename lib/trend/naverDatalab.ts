// 네이버 데이터랩 검색어 트렌드 API
// https://developers.naver.com/docs/serviceapi/datalab/search/search.md
// 필요 환경변수: NAVER_CLIENT_ID, NAVER_CLIENT_SECRET (네이버 개발자센터에서 발급)

export interface NaverKeywordPoint {
  keyword: string;
  date: string; // YYYY-MM-DD
  value: number; // 상대 검색량 지수 (0~100)
}

export function naverKeysConfigured(): boolean {
  return !!(process.env.NAVER_CLIENT_ID && process.env.NAVER_CLIENT_SECRET);
}

/**
 * 키워드 그룹별 최근 검색량 트렌드를 조회한다.
 * 네이버 API는 그룹당 최대 5개 키워드, 요청당 최대 5개 그룹까지 허용한다.
 */
export async function fetchNaverKeywordTrend(
  keywords: string[],
  opts: { startDate: string; endDate: string; timeUnit?: "date" | "week" | "month" } = {
    startDate: "",
    endDate: "",
  }
): Promise<NaverKeywordPoint[]> {
  if (!naverKeysConfigured()) {
    throw new Error("NAVER_CLIENT_ID / NAVER_CLIENT_SECRET 환경변수가 설정되지 않았습니다.");
  }
  const clientId = process.env.NAVER_CLIENT_ID!;
  const clientSecret = process.env.NAVER_CLIENT_SECRET!;

  const results: NaverKeywordPoint[] = [];
  // 5개씩 그룹으로 나눠 요청 (네이버 API 제한)
  for (let i = 0; i < keywords.length; i += 5) {
    const chunk = keywords.slice(i, i + 5);
    const body = {
      startDate: opts.startDate,
      endDate: opts.endDate,
      timeUnit: opts.timeUnit || "week",
      keywordGroups: chunk.map((k) => ({ groupName: k, keywords: [k] })),
    };

    const res = await fetch("https://openapi.naver.com/v1/datalab/search", {
      method: "POST",
      headers: {
        "X-Naver-Client-Id": clientId,
        "X-Naver-Client-Secret": clientSecret,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`네이버 데이터랩 API 오류 (${res.status}): ${text}`);
    }

    const json = await res.json();
    for (const group of json.results || []) {
      for (const point of group.data || []) {
        results.push({ keyword: group.title, date: point.period, value: point.ratio });
      }
    }
  }

  return results;
}
