// 사용자에게 노출되는 모든 실패/폴백 문구의 단일 소스. 원본 에러(Postgres 코드, 스택트레이스 등)는
// 절대 여기서 밖으로 내보내지 않는다 — 호출부가 console.error로 서버 로그에만 남긴다.

export const OLIVIA_FALLBACK_MESSAGES = {
  toolInputUnreadable: "요청을 정확히 이해하지 못했어요. 다시 한 번 말씀해주시겠어요?",
  toolFailureGeneric: "작업을 완료하지 못했어요. 다시 시도해주세요.",
  streamFailure: "Olivia 응답을 불러오지 못했어요. 다시 시도해주세요.",
  duplicateToolCall: "같은 요청이 반복돼서 중단했어요. 다시 한 번 말씀해주시겠어요?",
  sanitizationFallback: "답변을 정리하는 중에 문제가 있었어요. 다시 한 번 말씀해주시겠어요?",
  emptyResponseFallback: "요청하신 작업을 확인했어요.",
  featureNotFoundSoft: (query: string) =>
    `"${query}"와 정확히 같은 기능은 찾지 못했어요. 어떤 화면을 원하시는지 조금 더 설명해주시겠어요?`,
  ambiguousFeaturePrompt: (names: string[]) => `${names.join(", ")} 중 어떤 걸 열까요?`,
} as const;

const ERROR_PATTERN_MAP: Array<{ test: (raw: string) => boolean; message: string }> = [
  { test: (r) => /PGRST\d+/i.test(r), message: "데이터를 불러오지 못했어요. 잠시 후 다시 시도해주세요." },
  { test: (r) => /duplicate key|unique constraint/i.test(r), message: "이미 등록된 항목이에요." },
  { test: (r) => /foreign key|violates/i.test(r), message: "연결된 다른 데이터 때문에 처리하지 못했어요." },
  { test: (r) => /timeout|ETIMEDOUT|ECONNRESET|ENOTFOUND/i.test(r), message: "요청이 지연되고 있어요. 다시 시도해주세요." },
  { test: (r) => /not found|no rows|찾지 못했/i.test(r), message: "요청한 항목을 찾지 못했어요." },
  { test: (r) => /unauthorized|forbidden|permission/i.test(r), message: "이 작업을 처리할 권한이 없어요." },
  // 스택트레이스/raw JSON/파일 경로처럼 보이는 문자열은 마지막에 포괄적으로 걸러낸다.
  { test: (r) => /\bat\s+\S+\.(ts|tsx|js):\d+|^\{[\s\S]*\}$|\.(ts|tsx|js):\d+:\d+/.test(r), message: "작업 중 문제가 생겼어요. 다시 시도해주세요." },
];

export type NormalizedError = { userMessage: string; logDetail: string };

/**
 * 원본 에러(raw)는 절대 사용자에게 그대로 내보내지 않는다. 알려진 패턴이면 그에 맞는 한국어
 * 안내 문구로, 모르면 fallback으로 매핑한다. logDetail은 호출부가 console.error로 서버 로그에만
 * 남기기 위한 것 — 클라이언트로 보내면 안 된다.
 */
export function normalizeToolError(error: unknown, fallback: string = OLIVIA_FALLBACK_MESSAGES.toolFailureGeneric): NormalizedError {
  const raw = error instanceof Error ? error.message : String(error ?? "알 수 없는 오류");
  const matched = ERROR_PATTERN_MAP.find((rule) => rule.test(raw));
  return {
    userMessage: matched?.message ?? fallback,
    logDetail: raw,
  };
}
