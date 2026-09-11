import type { OliviaUiAction } from "@/lib/olivia/agent/actionTypes";
import type { OliviaContextSnapshot } from "@/lib/olivia/v2/types";
import type { OliviaMessageBlock } from "@/lib/olivia/v2/types";

export type OliviaPendingActionStatus = "pending" | "approved" | "rejected" | "deferred" | "completed" | "failed";

export type OliviaPendingAction = {
  id: string;
  status: OliviaPendingActionStatus;
  intent: string;
  toolName: string;
  toolInput: Record<string, unknown>;
  target?: { resourceType?: string; resourceId?: string; title?: string };
  prompt: string;
  createdAt: string;
  resolvedAt?: string;
};

export type PendingActionTurn = "approve" | "reject" | "defer" | "correction" | "none";

const APPROVE_PATTERN = /^(응|네|예|그래|맞아|좋아|오케이|ok|ㅇㅇ|해\s*줘|진행해|적용해|그렇게\s*해)([.!~\s]|$)/i;
const REJECT_PATTERN = /^(아니|아니야|취소|하지\s*마|안\s*할래|됐어)([.!~\s]|$)/i;
const DEFER_PATTERN = /^(일단\s*)?(보류|나중에|다음에|좀\s*있다가)([.!~\s]|$)/i;
const CORRECTION_PATTERN = /^(아니[,.]?\s*)?.*(말고|대신|으로|로)\s*(해|하자|맞춰|바꿔)/i;

function object(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

export function readPendingAction(metadata: unknown): OliviaPendingAction | undefined {
  const raw = object(object(metadata)?.pendingAction);
  if (!raw || typeof raw.id !== "string" || typeof raw.toolName !== "string" || typeof raw.prompt !== "string") return undefined;
  if (!raw.toolInput || typeof raw.toolInput !== "object" || Array.isArray(raw.toolInput)) return undefined;
  const allowed = new Set<OliviaPendingActionStatus>(["pending", "approved", "rejected", "deferred", "completed", "failed"]);
  if (!allowed.has(raw.status as OliviaPendingActionStatus)) return undefined;
  const target = object(raw.target);
  return {
    id: raw.id,
    status: raw.status as OliviaPendingActionStatus,
    intent: typeof raw.intent === "string" ? raw.intent : raw.toolName,
    toolName: raw.toolName,
    toolInput: raw.toolInput as Record<string, unknown>,
    ...(target ? { target: {
      ...(typeof target.resourceType === "string" ? { resourceType: target.resourceType } : {}),
      ...(typeof target.resourceId === "string" ? { resourceId: target.resourceId } : {}),
      ...(typeof target.title === "string" ? { title: target.title } : {}),
    } } : {}),
    prompt: raw.prompt,
    createdAt: typeof raw.createdAt === "string" ? raw.createdAt : new Date(0).toISOString(),
    ...(typeof raw.resolvedAt === "string" ? { resolvedAt: raw.resolvedAt } : {}),
  };
}

export function pendingActionFromUiAction(
  action: OliviaUiAction,
  context: OliviaContextSnapshot,
  now = new Date().toISOString(),
): OliviaPendingAction | undefined {
  if (action.type !== "REQUEST_APPROVAL") return undefined;
  return {
    id: action.approvalId,
    status: "pending",
    intent: action.toolName,
    toolName: action.toolName,
    toolInput: action.toolInput,
    target: {
      ...(context.activeWorkspace ? { resourceType: context.activeWorkspace } : {}),
      ...(context.activeResourceId ? { resourceId: context.activeResourceId } : {}),
      ...(context.activeClientName ? { title: context.activeClientName } : {}),
    },
    prompt: action.summary,
    createdAt: now,
  };
}

export function resolvePendingActionTurn(message: string, pending?: OliviaPendingAction): PendingActionTurn {
  if (!pending || pending.status !== "pending") return "none";
  const normalized = message.trim();
  if (!normalized) return "none";
  if (DEFER_PATTERN.test(normalized)) return "defer";
  if (CORRECTION_PATTERN.test(normalized) && /\d|[일이삼사오육칠팔구십백천만억]/.test(normalized)) return "correction";
  if (REJECT_PATTERN.test(normalized)) return "reject";
  if (APPROVE_PATTERN.test(normalized) || /(하면\s*돼|맞추면\s*돼|그대로\s*(해|진행))/.test(normalized)) return "approve";
  return "none";
}

export function resolvePendingActionContext(
  context: OliviaContextSnapshot,
  pending: OliviaPendingAction,
): OliviaContextSnapshot {
  const resourceType = pending.target?.resourceType;
  const resourceId = pending.target?.resourceId;
  return {
    ...context,
    activeWorkspace: resourceType || context.activeWorkspace,
    activeResourceId: resourceId || context.activeResourceId,
    currentDocumentType: resourceType || context.currentDocumentType,
    currentDocumentId: resourceId || context.currentDocumentId,
  };
}

export function transitionPendingAction(
  pending: OliviaPendingAction,
  status: Exclude<OliviaPendingActionStatus, "pending">,
  now = new Date().toISOString(),
): OliviaPendingAction {
  return { ...pending, status, resolvedAt: now };
}

export function pendingActionPromptContext(pending?: OliviaPendingAction): string | undefined {
  if (!pending || pending.status !== "pending") return undefined;
  return `[대기 중인 승인]\n대상: ${pending.target?.title || pending.target?.resourceType || "현재 작업"}\n질문: ${pending.prompt}\n사용자가 동의하면 ${pending.toolName}을 같은 입력으로 실행한다. 다시 승인받지 않는다.`;
}

export function pendingActionBlock(pending?: OliviaPendingAction): OliviaMessageBlock | undefined {
  if (!pending || pending.status !== "pending") return undefined;
  return {
    type: "approval",
    approvalId: pending.id,
    summary: pending.prompt,
    toolName: pending.toolName,
    toolInput: pending.toolInput,
    confirmLabel: "진행",
    state: "pending",
  };
}
