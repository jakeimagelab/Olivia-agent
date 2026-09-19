import type { OliviaPendingAction } from "@/lib/olivia/conversation/dialogueState";
import type { OliviaToolResult } from "@/lib/olivia/v2/types";
import { OLIVIA_FALLBACK_MESSAGES } from "@/lib/olivia/output/errorMessages";

export type OliviaResponseOutcome =
  | { status: "completed"; summary?: string; targetTitle?: string; totalAmount?: number }
  | { status: "needs_confirmation"; prompt: string }
  | { status: "needs_input"; prompt: string }
  | { status: "deferred"; targetTitle?: string }
  | { status: "rejected" }
  | { status: "failed"; reason?: string; unchanged?: boolean }
  | { status: "chat"; text: string };

function numeric(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

export function toolResultOutcome(
  result: OliviaToolResult,
  pending?: OliviaPendingAction,
): OliviaResponseOutcome {
  if (!result.success) return { status: "failed", reason: result.error, unchanged: result.verification?.persisted !== true };
  const summary = typeof result.data?.summary === "string" ? result.data.summary : undefined;
  const totalAmount = numeric(result.data?.totalAmount) ?? numeric(result.verification?.details?.totalAmount);
  return { status: "completed", summary, targetTitle: pending?.target?.title, totalAmount };
}

function cleanSummary(summary: string): string {
  return summary
    .replace(/^(요청하신\s*)?(조정\s*적용|작업\s*요청)(을|를|은|는)?\s*/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function renderOliviaOutcome(outcome: OliviaResponseOutcome): string {
  if (outcome.status === "chat") return outcome.text;
  if (outcome.status === "needs_confirmation") return outcome.prompt.trim();
  if (outcome.status === "needs_input") return outcome.prompt.trim();
  if (outcome.status === "deferred") return outcome.targetTitle
    ? `알겠어요. ${outcome.targetTitle} 건은 그대로 보관할게요.`
    : "알겠어요. 그대로 보관할게요.";
  if (outcome.status === "rejected") return "알겠어요. 이 작업은 진행하지 않을게요.";
  if (outcome.status === "failed") {
    const reason = outcome.reason ? cleanSummary(outcome.reason) : "지금은 작업을 완료하지 못했어요.";
    return outcome.unchanged ? `${reason} 기존 내용은 그대로예요. 다시 해볼까요?` : reason;
  }
  if (outcome.totalAmount && outcome.targetTitle) {
    return `됐어요. ${outcome.targetTitle} 건을 ${outcome.totalAmount.toLocaleString("ko-KR")}원으로 맞췄어요.`;
  }
  if (outcome.summary) return cleanSummary(outcome.summary);
  return OLIVIA_FALLBACK_MESSAGES.emptyResponseFallback;
}

export function renderVerifiedToolRound(entries: Array<{ result: OliviaToolResult }>): string | null {
  if (!entries.length) return null;
  if (!entries.every(({ result }) => !result.success || typeof result.data?.summary === "string" || typeof result.data?.totalAmount === "number")) return null;
  const lines = entries.map(({ result }) => renderOliviaOutcome(toolResultOutcome(result))).filter(Boolean);
  return [...new Set(lines)].join("\n") || null;
}

// 코드 요청서(2026-09-18) 작업 B — 헤르메스가 쓴 문장을 통째로 검증 템플릿으로 바꾸는 대신,
// 원문은 그대로 두고 "무엇이 실제로 저장/변경됐는지 + 식별자 수준"만 짧게 한 줄 덧붙인다.
// lib/hermes/mcp/oliviaToolBridge.ts의 inferResource()가 매기는 resourceType과 동일한 값
// (quote/contract/conti/memo/calendar/work/client)만 다룬다 — 새 분류 체계를 만들지 않는다.
const VERIFICATION_RESOURCE_LABEL: Record<string, string> = {
  quote: "견적서", contract: "계약서", conti: "콘티", memo: "메모",
  calendar: "일정", work: "업무", client: "고객",
};

export type VerifiedToolCallRef = {
  success: boolean;
  resourceType?: string;
  resourceId?: string;
  changedEntityId?: string;
};

export function buildVerificationLine(calls: VerifiedToolCallRef[]): string | null {
  const identifiable = calls.filter((call) => call.success && (call.changedEntityId || call.resourceId));
  if (!identifiable.length) return null;
  const parts = identifiable.map((call) => {
    const label = VERIFICATION_RESOURCE_LABEL[call.resourceType ?? ""] ?? "항목";
    const id = (call.changedEntityId || call.resourceId)!;
    return `${label} 저장됨(${id.slice(0, 8)})`;
  });
  return `✓ ${[...new Set(parts)].join(", ")}`;
}
