import type { OliviaClientSearchResult } from "@/lib/olivia/clientSearch";

type AuditEntry = {
  result: HermesClientSearchAudit;
  createdAt: number;
};

export type HermesClientSearchAudit =
  | { success: true; result: OliviaClientSearchResult }
  | { success: false; error: string };

// client.search 외의 tool(create_quote 등)이 실제로 실행/저장됐는지 기록하는 범용 감사.
// client.search 전용 record/consume 함수는 그대로 두고(회귀 위험 최소화) 새 tool들만 이걸 쓴다.
export type HermesToolAudit =
  | { success: true; data?: unknown }
  | { success: false; error: string };

type GenericAuditEntry = { toolName: string; result: HermesToolAudit; createdAt: number };

const globalAudit = globalThis as typeof globalThis & {
  __oliviaHermesToolAudit?: Map<string, AuditEntry>;
  __oliviaHermesGenericToolAudit?: Map<string, GenericAuditEntry[]>;
};
const auditEntries = globalAudit.__oliviaHermesToolAudit ?? new Map<string, AuditEntry>();
globalAudit.__oliviaHermesToolAudit = auditEntries;
const genericAuditEntries = globalAudit.__oliviaHermesGenericToolAudit ?? new Map<string, GenericAuditEntry[]>();
globalAudit.__oliviaHermesGenericToolAudit = genericAuditEntries;
const MAX_AGE_MS = 2 * 60 * 1000;

function prune() {
  const cutoff = Date.now() - MAX_AGE_MS;
  for (const [key, value] of auditEntries) {
    if (value.createdAt < cutoff) auditEntries.delete(key);
  }
  for (const [key, list] of genericAuditEntries) {
    const kept = list.filter((entry) => entry.createdAt >= cutoff);
    if (kept.length) genericAuditEntries.set(key, kept);
    else genericAuditEntries.delete(key);
  }
}

export function recordHermesClientSearch(requestId: string | undefined, result: HermesClientSearchAudit) {
  if (!requestId) return;
  prune();
  auditEntries.set(requestId, { result, createdAt: Date.now() });
}

export function consumeHermesClientSearch(requestId: string): HermesClientSearchAudit | undefined {
  prune();
  const entry = auditEntries.get(requestId);
  auditEntries.delete(requestId);
  return entry?.result;
}

export function recordHermesToolCall(requestId: string | undefined, toolName: string, result: HermesToolAudit) {
  if (!requestId) return;
  prune();
  const list = genericAuditEntries.get(requestId) ?? [];
  list.push({ toolName, result, createdAt: Date.now() });
  genericAuditEntries.set(requestId, list);
}

export function consumeHermesToolCalls(requestId: string): Array<{ toolName: string; result: HermesToolAudit }> {
  prune();
  const list = genericAuditEntries.get(requestId) ?? [];
  genericAuditEntries.delete(requestId);
  return list.map(({ toolName, result }) => ({ toolName, result }));
}
