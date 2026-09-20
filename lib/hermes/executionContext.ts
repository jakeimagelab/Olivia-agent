import type { HermesChatContext } from "@/lib/hermes/types";

type Entry = { context: HermesChatContext; conversationId?: string; createdAt: number };
const globalStore = globalThis as typeof globalThis & { __oliviaHermesExecutionContext?: Map<string, Entry> };
const entries = globalStore.__oliviaHermesExecutionContext ?? new Map<string, Entry>();
globalStore.__oliviaHermesExecutionContext = entries;
const MAX_AGE_MS = 2 * 60 * 1000;

function prune() {
  const cutoff = Date.now() - MAX_AGE_MS;
  for (const [id, entry] of entries) if (entry.createdAt < cutoff) entries.delete(id);
}

// Hermes MCP는 도구 목록을 연결 단위로 캐시한다. turn별 선택 목록을 여기에 싣고 ListTools를
// 좁히면 이전 turn의 목록이 계속 재사용되어 실제 도구가 사라질 수 있다. 실행 컨텍스트에는
// 권한·현재 리소스처럼 CallTool에 필요한 상태만 보관한다.
export function registerHermesExecutionContext(requestId: string, context: HermesChatContext, conversationId?: string) {
  prune();
  entries.set(requestId, { context, conversationId, createdAt: Date.now() });
}

export function getHermesExecutionContext(requestId?: string) {
  if (!requestId) return undefined;
  prune();
  return entries.get(requestId);
}

export function clearHermesExecutionContext(requestId: string) {
  entries.delete(requestId);
}
