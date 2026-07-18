// 구글 트렌드 — 공식 API가 없어 pytrends와 동일한 방식으로 비공식 내부 엔드포인트를 사용한다.
// (Node/Next.js 환경이라 파이썬 pytrends 대신 동일 로직을 TS로 직접 구현)
// 별도 API 키 불필요.

const TRENDS_HOST = "https://trends.google.com";

function stripXssiPrefix(text: string): string {
  // 구글 트렌드 응답은 ")]}'" 접두사가 붙어있다.
  const idx = text.indexOf("{");
  return idx >= 0 ? text.slice(idx) : text;
}

export interface GoogleTrendPoint {
  keyword: string;
  date: string; // YYYY-MM-DD
  value: number; // 관심도 0~100
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 키워드 하나에 대해 최근 기간(geo=KR)의 관심도 변화를 조회한다.
 * pytrends의 interest_over_time()과 동일한 2단계(explore → widgetdata) 흐름을 따른다.
 * 비공식 엔드포인트라 과호출 시 429가 자주 나는데, 잠깐 쉬었다 재시도하면 성공하는 경우가
 * 많아서 429에 한해 백오프 재시도를 둔다.
 */
export async function fetchGoogleTrend(
  keyword: string,
  opts: { timeframe?: string; geo?: string } = {}
): Promise<GoogleTrendPoint[]> {
  const RETRY_DELAYS_MS = [4000, 8000];
  for (let attempt = 0; ; attempt++) {
    try {
      return await fetchGoogleTrendOnce(keyword, opts);
    } catch (err: any) {
      const is429 = /\(429\)/.test(String(err?.message || ""));
      if (!is429 || attempt >= RETRY_DELAYS_MS.length) throw err;
      await sleep(RETRY_DELAYS_MS[attempt]);
    }
  }
}

async function fetchGoogleTrendOnce(
  keyword: string,
  opts: { timeframe?: string; geo?: string } = {}
): Promise<GoogleTrendPoint[]> {
  const timeframe = opts.timeframe || "today 3-m";
  const geo = opts.geo || "KR";

  // 1단계: explore — 위젯 토큰 발급
  const exploreReq = {
    comparisonItem: [{ keyword, geo, time: timeframe }],
    category: 0,
    property: "",
  };
  const exploreUrl = `${TRENDS_HOST}/trends/api/explore?hl=ko&tz=-540&req=${encodeURIComponent(
    JSON.stringify(exploreReq)
  )}`;
  const exploreRes = await fetch(exploreUrl, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; OliviaTrendBot/1.0)" },
  });
  if (!exploreRes.ok) {
    throw new Error(`구글 트렌드 explore 요청 실패 (${exploreRes.status})`);
  }
  const exploreJson = JSON.parse(stripXssiPrefix(await exploreRes.text()));
  const widget = (exploreJson.widgets || []).find((w: any) => w.id === "TIMESERIES");
  if (!widget) return [];

  // 2단계: widgetdata — 실제 시계열 데이터
  const widgetUrl = `${TRENDS_HOST}/trends/api/widgetdata/multiline?hl=ko&tz=-540&req=${encodeURIComponent(
    JSON.stringify(widget.request)
  )}&token=${encodeURIComponent(widget.token)}`;
  const widgetRes = await fetch(widgetUrl, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; OliviaTrendBot/1.0)" },
  });
  if (!widgetRes.ok) {
    throw new Error(`구글 트렌드 widgetdata 요청 실패 (${widgetRes.status})`);
  }
  const widgetJson = JSON.parse(stripXssiPrefix(await widgetRes.text()));
  const lines = widgetJson?.default?.timelineData || [];

  return lines.map((point: any) => ({
    keyword,
    date: new Date(parseInt(point.time, 10) * 1000).toISOString().slice(0, 10),
    value: point.value?.[0] ?? 0,
  }));
}
