import type { OliviaToolResult } from "@/lib/olivia/v2/types";
import { OLIVIA_FALLBACK_MESSAGES } from "@/lib/olivia/output/errorMessages";

// 이 tool들의 최종 확인 문구는 모델의 자유 텍스트가 아니라 toolExecutor.ts가 실행 결과로
// 이미 계산해 둔 data.summary/error를 그대로 쓴다. 견적 mutation이 "tool 실행이 끝나기도
// 전에 완료를 주장하는" 거짓 성공 리포트의 실제 발생 지점이었기 때문에(app/api/olivia/v2/
// stream/route.ts) 이 집합에 한해서만 모델 텍스트 대신 서버 authored 문구로 강제한다 —
// 캘린더/콘티/고객 등 다른 도메인 tool은 이 집합에 없으므로 전혀 영향받지 않는다.
export const QUOTE_MUTATION_TOOLS = new Set([
  "update_quote_item",
  "add_quote_item",
  "remove_quote_item",
  "update_quote_note",
  "update_quote_info",
  "apply_quote_discount",
  "update_quote_vat_mode",
  "apply_quote_rebalance",
  "publish_quote",
  "download_quote_pdf",
]);

export function isQuoteMutationTool(toolName: string): boolean {
  return QUOTE_MUTATION_TOOLS.has(toolName);
}

// 성공 시 data.summary(예: "10,000원 할인을 적용했어요."), 실패 시 result.error를 그대로
// 반환한다 — 둘 다 이미 toolExecutor.ts/errorMessages.ts가 한국어 완결 문장으로 만들어 둔
// 값이라 여기서 새로 문구를 짓지 않는다.
export function buildQuoteToolConfirmation(toolName: string, result: OliviaToolResult): string | null {
  if (!isQuoteMutationTool(toolName)) return null;
  if (result.success) {
    const summary = result.data?.summary;
    return typeof summary === "string" && summary ? summary : OLIVIA_FALLBACK_MESSAGES.emptyResponseFallback;
  }
  return result.error || OLIVIA_FALLBACK_MESSAGES.toolFailureGeneric;
}

// 한 라운드에 여러 tool 호출이 섞일 수 있다(멀티 액션, 순서는 toolScheduler.ts가 보장).
// 이 라운드의 모든 호출이 견적 mutation tool일 때만 모델 텍스트를 결정론적 문구로 통째로
// 교체한다 — 부분 성공/실패는 각 tool의 문구를 줄바꿈으로 이어붙여 정직하게 보고한다. 견적
// tool과 다른 도메인 tool이 섞인 라운드(드문 케이스)는 null을 반환해 기존 모델 텍스트를
// 그대로 쓰게 한다 — 이번 스코프에서는 견적 tool만 결정론적으로 다룬다.
export function buildQuoteRoundConfirmation(
  entries: Array<{ toolName: string; result: OliviaToolResult }>
): string | null {
  if (!entries.length) return null;
  if (!entries.every((entry) => isQuoteMutationTool(entry.toolName))) return null;
  const lines = entries
    .map((entry) => buildQuoteToolConfirmation(entry.toolName, entry.result))
    .filter((line): line is string => Boolean(line));
  return lines.length ? lines.join("\n") : null;
}
