import type { DiagnosisChannel } from "./types";

// 병원브랜드이미지 진단 API 전용 공통 입력값 검증 헬퍼 (섹션 8).
// 이 프로젝트에는 zod가 없어 기존 라우트들의 관행(수동 검증)을 그대로 따른다.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

export const HBD_VALID_CHANNELS: DiagnosisChannel[] = ["website", "naver_place", "naver_blog", "instagram", "youtube", "other"];

export function isValidChannel(value: unknown): value is DiagnosisChannel {
  return typeof value === "string" && (HBD_VALID_CHANNELS as string[]).includes(value);
}

export function escapeText(value: unknown, max = 400): string {
  return String(value ?? "")
    .replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .trim().slice(0, max);
}

export function escapeList(value: unknown, maxItems = 20, maxItemLength = 120): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of value) {
    const cleaned = escapeText(item, maxItemLength);
    if (!cleaned || seen.has(cleaned)) continue;
    seen.add(cleaned);
    out.push(cleaned);
    if (out.length >= maxItems) break;
  }
  return out;
}

// 완전한 SSRF 방어는 lib/channelAnalysis.ts의 assertSafeChannelUrl()이 담당한다(내부망/사설 IP 차단).
// 여기서는 그 이전 단계에서 명백히 잘못된 값(빈 문자열/과도한 길이/허용되지 않은 프로토콜)만 먼저 거른다.
export function isPlausibleHttpUrl(value: unknown): value is string {
  if (typeof value !== "string" || !value || value.length > 2048) return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}
