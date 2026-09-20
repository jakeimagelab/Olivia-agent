export type MobileWeatherDescription = {
  label: string;
  symbol: string;
};

export function describeMobileWeather(code: number, isDay = true): MobileWeatherDescription {
  if (code === 0) return { label: "맑음", symbol: isDay ? "☀️" : "🌙" };
  if (code === 1 || code === 2) return { label: "구름 조금", symbol: isDay ? "🌤️" : "☁️" };
  if (code === 3) return { label: "흐림", symbol: "☁️" };
  if (code === 45 || code === 48) return { label: "안개", symbol: "🌫️" };
  if (code >= 51 && code <= 57) return { label: "이슬비", symbol: "🌦️" };
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return { label: "비", symbol: "🌧️" };
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return { label: "눈", symbol: "🌨️" };
  if (code >= 95) return { label: "뇌우", symbol: "⛈️" };
  return { label: "날씨 확인", symbol: "" };
}

export function mobileRegionLabel(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const data = value as { documents?: Array<Record<string, unknown>> };
  const rows = Array.isArray(data.documents) ? data.documents : [];
  const row = rows.find((candidate) => candidate.region_type === "H") || rows[0];
  if (!row) return null;
  const first = typeof row.region_1depth_name === "string" ? row.region_1depth_name.trim() : "";
  const second = typeof row.region_2depth_name === "string" ? row.region_2depth_name.trim() : "";
  return [first, second].filter(Boolean).join(" ") || null;
}
