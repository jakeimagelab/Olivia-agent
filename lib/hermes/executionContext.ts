import type { HermesChatContext } from "@/lib/hermes/types";

type Entry = { context: HermesChatContext; conversationId?: string; createdAt: number; selectedToolNames?: string[] };
const globalStore = globalThis as typeof globalThis & { __oliviaHermesExecutionContext?: Map<string, Entry> };
const entries = globalStore.__oliviaHermesExecutionContext ?? new Map<string, Entry>();
globalStore.__oliviaHermesExecutionContext = entries;
const MAX_AGE_MS = 2 * 60 * 1000;

function prune() {
  const cutoff = Date.now() - MAX_AGE_MS;
  for (const [id, entry] of entries) if (entry.createdAt < cutoff) entries.delete(id);
}

// 코드 요청서(2026-09-18) 작업 C — 이번 turn에 route.ts의 selectOliviaTools()가 이미 골라둔
// 도구 이름 집합을 실행 컨텍스트에 같이 저장해둔다. listHermesOliviaTools()가 이 값으로
// ListTools 응답을 좁히고, executeHermesOliviaTool()은 이 값을 읽어 로그만 남긴다(차단 안 함).
export function registerHermesExecutionContext(requestId: string, context: HermesChatContext, conversationId?: string, selectedToolNames?: string[]) {
  prune();
  entries.set(requestId, { context, conversationId, createdAt: Date.now(), selectedToolNames });
}

export function getHermesExecutionContext(requestId?: string) {
  if (!requestId) return undefined;
  prune();
  return entries.get(requestId);
}

export function clearHermesExecutionContext(requestId: string) {
  entries.delete(requestId);
}
