export type MergeableChatMessage = {
  id?: string;
  clientRequestId?: string;
  createdAt?: string;
  role: "user" | "assistant";
  content: string;
  source?: "web" | "telegram";
};

const OPTIMISTIC_MATCH_WINDOW_MS = 30_000;

function isRecentOptimisticMatch(a: MergeableChatMessage, b: MergeableChatMessage) {
  if (a.id || a.role !== b.role || a.content !== b.content || (a.source ?? "web") !== (b.source ?? "web")) return false;
  const aTime = Date.parse(a.createdAt || "");
  const bTime = Date.parse(b.createdAt || "");
  return Number.isFinite(aTime) && Number.isFinite(bTime) && Math.abs(aTime - bTime) <= OPTIMISTIC_MATCH_WINDOW_MS;
}

/**
 * DB ID/요청 ID가 같으면 기존 메시지를 갱신한다. metadata 컬럼이 없는 이전 DB에서
 * 요청 ID가 사라져도, 방금 낙관적으로 추가한 동일 메시지 한 건만 DB 행으로 교체한다.
 */
export function mergeChatMessages<T extends MergeableChatMessage>(previous: T[], incoming: T[]): T[] {
  if (!incoming.length) return previous;
  const merged = [...previous];

  for (const message of incoming) {
    let existingIndex = message.id ? merged.findIndex((item) => item.id === message.id) : -1;
    if (existingIndex < 0 && message.clientRequestId) {
      existingIndex = merged.findIndex((item) => item.clientRequestId === message.clientRequestId);
    }
    if (existingIndex < 0 && message.id && !message.clientRequestId) {
      existingIndex = merged.findIndex((item) => isRecentOptimisticMatch(item, message));
    }

    if (existingIndex >= 0) {
      const current = merged[existingIndex];
      merged[existingIndex] = {
        ...current,
        ...message,
        clientRequestId: message.clientRequestId || current.clientRequestId,
      };
    } else {
      merged.push(message);
    }
  }

  return merged;
}
