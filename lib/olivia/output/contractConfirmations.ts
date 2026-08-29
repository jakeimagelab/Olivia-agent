import type { OliviaToolResult } from "@/lib/olivia/v2/types";
import { OLIVIA_FALLBACK_MESSAGES } from "@/lib/olivia/output/errorMessages";

// quoteConfirmations.ts와 완전히 같은 패턴(PHASE 3, 2026-08-30) — 이 tool들의 최종 확인 문구는
// 모델의 자유 텍스트가 아니라 toolExecutor.ts가 실행 결과로 이미 계산해 둔 data.summary/error를
// 그대로 쓴다.
export const CONTRACT_MUTATION_TOOLS = new Set([
  "update_contract_terms",
  "publish_contract",
  "download_contract_pdf",
]);

export function isContractMutationTool(toolName: string): boolean {
  return CONTRACT_MUTATION_TOOLS.has(toolName);
}

export function buildContractToolConfirmation(toolName: string, result: OliviaToolResult): string | null {
  if (!isContractMutationTool(toolName)) return null;
  if (result.success) {
    const summary = result.data?.summary;
    return typeof summary === "string" && summary ? summary : OLIVIA_FALLBACK_MESSAGES.emptyResponseFallback;
  }
  return result.error || OLIVIA_FALLBACK_MESSAGES.toolFailureGeneric;
}

export function buildContractRoundConfirmation(
  entries: Array<{ toolName: string; result: OliviaToolResult }>
): string | null {
  if (!entries.length) return null;
  if (!entries.every((entry) => isContractMutationTool(entry.toolName))) return null;
  const lines = entries
    .map((entry) => buildContractToolConfirmation(entry.toolName, entry.result))
    .filter((line): line is string => Boolean(line));
  return lines.length ? lines.join("\n") : null;
}
