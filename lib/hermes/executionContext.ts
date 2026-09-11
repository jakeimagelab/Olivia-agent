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
