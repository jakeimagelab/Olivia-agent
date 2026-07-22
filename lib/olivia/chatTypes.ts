export type OliviaChatWorkItemKind =
  | "insight"
  | "action"
  | "approval"
  | "commitment"
  | "project"
  | "event"
  | "meeting"
  | "memo"
  | "client_candidate";

export type OliviaChatWorkItemAction =
  | "view"
  | "prepare"
  | "approve"
  | "run"
  | "complete"
  | "acknowledge"
  | "snooze"
  | "dismiss"
  | "brief"
  | "link"
  | "analyze"
  | "followups"
  | "register";

export type OliviaChatWorkItem = {
  id: string;
  kind: OliviaChatWorkItemKind;
  title: string;
  summary: string;
  clientName?: string;
  projectName?: string;
  workflowRunId?: string;
  priorityScore?: number;
  dueAt?: string;
  status?: string;
  reason?: string;
  metadata?: Record<string, unknown>;
  availableActions: OliviaChatWorkItemAction[];
};

export type OliviaChatToolResult = {
  action: "done";
  message: string;
  workItems?: OliviaChatWorkItem[];
};

export type OliviaChatReference = Pick<
  OliviaChatWorkItem,
  "id" | "kind" | "title" | "summary" | "clientName" | "projectName" | "workflowRunId" | "dueAt" | "status" | "availableActions"
> & { metadata?: Record<string, unknown> };

export function compactWorkItemReferences(items: OliviaChatWorkItem[]): OliviaChatReference[] {
  return items.slice(0, 12).map((item) => ({
    id: item.id,
    kind: item.kind,
    title: item.title,
    summary: item.summary,
    clientName: item.clientName,
    projectName: item.projectName,
    workflowRunId: item.workflowRunId,
    dueAt: item.dueAt,
    status: item.status,
    availableActions: item.availableActions,
    metadata: item.metadata,
  }));
}

export function formatWorkItemReferenceContext(items: OliviaChatReference[]): string {
  if (!items.length) return "";
  const lines = items.slice(0, 12).map((item, index) => {
    const owner = [item.clientName, item.projectName].filter(Boolean).join(" / ");
    const calendarTaskId = item.metadata?.calendarTaskId ? String(item.metadata.calendarTaskId) : "";
    return `${index + 1}. [${item.kind}] ${item.title}${owner ? ` · ${owner}` : ""} · id=${item.id}${item.workflowRunId ? ` · workflowRunId=${item.workflowRunId}` : ""}${calendarTaskId ? ` · calendarTaskId=${calendarTaskId}` : ""}${item.status ? ` · status=${item.status}` : ""}`;
  });
  return `[직전 업무 조회 결과]\n${lines.join("\n")}\n사용자가 '첫 번째', '그 고객', '방금 항목'이라고 말하면 위 ID를 사용하세요.`;
}

export function resolveWorkItemReference(
  items: OliviaChatReference[],
  itemId?: string | null,
  referenceIndex?: number | null,
): OliviaChatReference | null {
  if (itemId) return items.find((item) => item.id === itemId) ?? null;
  if (referenceIndex && Number.isInteger(referenceIndex) && referenceIndex > 0) {
    return items[referenceIndex - 1] ?? null;
  }
  return null;
}

export function sortChatWorkItems(items: OliviaChatWorkItem[]): OliviaChatWorkItem[] {
  return [...items].sort((a, b) => {
    const priority = (b.priorityScore ?? 0) - (a.priorityScore ?? 0);
    if (priority) return priority;
    const aDue = a.dueAt ? new Date(a.dueAt).getTime() : Number.POSITIVE_INFINITY;
    const bDue = b.dueAt ? new Date(b.dueAt).getTime() : Number.POSITIVE_INFINITY;
    return aDue - bDue;
  });
}
