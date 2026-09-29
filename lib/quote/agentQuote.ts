/**
 * 견적서의 포함 서비스 표기만 남긴 호환 모듈이다.
 *
 * 2026-09-30부터 견적 항목·금액·고객 정보는 이 파일의 모델 입력 구조가 아니라
 * quoteRequestParser가 사용자 원문에서 직접 읽는다. 계산도 computeQuoteTotals 하나만 쓴다.
 */
export type QuotePricingMode = "package" | "custom";

export type QuoteIncludedService = {
  type: "profile" | "staged" | "group" | "interior" | "video" | "other";
  label: string;
  personCount?: number | null;
  cutCount?: number | null;
  conceptCount?: number | null;
  deliverableCount?: number | null;
  description?: string | null;
};

export function hasExplicitPackageWording(value: unknown) {
  return typeof value === "string" && /패키지/.test(value);
}

/** 패키지는 원문에 이 단어가 있을 때만 선택한다. 그 밖의 자동 추측은 하지 않는다. */
export function resolveQuotePricingMode(_input: Record<string, unknown>, requestText?: string): QuotePricingMode {
  return hasExplicitPackageWording(requestText) ? "package" : "custom";
}

export function formatIncludedService(service: QuoteIncludedService) {
  const label = service.label.trim();
  const suffixes: string[] = [];
  if (service.personCount && !new RegExp(`${service.personCount}\\s*(?:명|인)`).test(label)) suffixes.push(`${service.personCount}명`);
  if (service.cutCount && !new RegExp(`${service.cutCount}\\s*컷`).test(label)) suffixes.push(`${service.cutCount}컷`);
  if (service.conceptCount && !new RegExp(`${service.conceptCount}\\s*컨셉`).test(label)) suffixes.push(`${service.conceptCount}컨셉`);
  if (service.deliverableCount && !new RegExp(`${service.deliverableCount}\\s*장`).test(label)) {
    suffixes.push(`${service.conceptCount ? "/ 약 " : "약 "}${service.deliverableCount}장`);
  }
  return [label, suffixes.join(" "), service.description || ""].filter(Boolean).join(" ").replace(/\s+\/\s+/g, " / ");
}
