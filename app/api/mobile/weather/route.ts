import { NextRequest, NextResponse } from "next/server";
import { isAdminSession } from "@/lib/passkey";
import { describeMobileWeather, mobileRegionLabel } from "@/lib/olivia/mobile/weather";

type OpenMeteoPayload = {
  current?: {
    temperature_2m?: unknown;
    weather_code?: unknown;
    is_day?: unknown;
  };
};

function coordinate(value: string | null, limit: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && Math.abs(parsed) <= limit ? parsed : null;
}

export async function GET(request: NextRequest) {
  if (!isAdminSession(request)) {
    return NextResponse.json({ ok: false, error: "관리자 로그인이 필요합니다." }, { status: 401 });
  }

  const latitude = coordinate(request.nextUrl.searchParams.get("latitude"), 90);
  const longitude = coordinate(request.nextUrl.searchParams.get("longitude"), 180);
  if (latitude === null || longitude === null) {
    return NextResponse.json({ ok: false, error: "현재 위치를 확인할 수 없습니다." }, { status: 400 });
  }

  const weatherRequest = fetch(
    `https://api.open-meteo.com/v1/forecast?latitude=${encodeURIComponent(latitude)}&longitude=${encodeURIComponent(longitude)}&current=temperature_2m,weather_code,is_day&timezone=Asia%2FSeoul`,
    { cache: "no-store", signal: AbortSignal.timeout(4_500) },
  ).then(async (response) => {
    if (!response.ok) return null;
    const payload = await response.json() as OpenMeteoPayload;
    const temperature = Number(payload.current?.temperature_2m);
    const code = Number(payload.current?.weather_code);
    if (!Number.isFinite(temperature) || !Number.isFinite(code)) return null;
    return {
      temperature: Math.round(temperature),
      ...describeMobileWeather(code, Number(payload.current?.is_day) !== 0),
    };
  }).catch(() => null);

  const kakaoKey = process.env.KAKAO_REST_API_KEY;
  const locationRequest = kakaoKey
    ? fetch(
      `https://dapi.kakao.com/v2/local/geo/coord2regioncode.json?x=${encodeURIComponent(longitude)}&y=${encodeURIComponent(latitude)}`,
      {
        headers: { Authorization: `KakaoAK ${kakaoKey}` },
        cache: "no-store",
        signal: AbortSignal.timeout(4_500),
      },
    ).then(async (response) => response.ok ? mobileRegionLabel(await response.json()) : null).catch(() => null)
    : Promise.resolve(null);

  const [weather, location] = await Promise.all([weatherRequest, locationRequest]);
  return NextResponse.json({ ok: true, weather, location });
}
