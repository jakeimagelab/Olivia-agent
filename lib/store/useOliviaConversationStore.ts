"use client";

import { create } from "zustand";
import { executeOliviaAction } from "@/lib/olivia/agent/actionRouter";
import { buildOliviaPageContext, getOliviaContextSnapshot } from "@/lib/store/oliviaContextStore";
import { useOliviaLayoutStore } from "@/lib/store/useOliviaLayoutStore";
import type { OliviaMessageBlock, OliviaStreamEvent, OliviaV2Message } from "@/lib/olivia/v2/types";
import { chooseConversationMessages } from "@/lib/olivia/conversationTimeline";

export type { OliviaMessage } from "@/lib/olivia/v2/types";

export type OliviaConversationState = {
  conversationId?: string;
  messages: OliviaV2Message[];
  isHydrated: boolean;
  isSending: boolean;
  isStreaming: boolean;
  activeResponseId?: string;
  agentStatus?: string;
  pendingWorkspaceOpen: boolean;
  lastFailedContent?: string;
  appendMessage: (message: OliviaV2Message) => void;
  updateMessage: (id: string, updates: Partial<OliviaV2Message>) => void;
  setMessages: (messages: OliviaV2Message[]) => void;
  setSending: (value: boolean) => void;
  setStreaming: (value: boolean) => void;
  setAgentStatus: (status?: string) => void;
  clearConversation: () => void;
  hydrate: () => Promise<void>;
  startNewConversation: () => Promise<void>;
  sendMessage: (content: string) => Promise<void>;
  stopResponse: () => void;
  retryLast: () => Promise<void>;
  approveAction: (approvalId: string, toolName: string, toolInput: Record<string, unknown>) => Promise<void>;
  cancelApproval: (approvalId: string) => void;
};

let activeController: AbortController | null = null;
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let bufferedDelta = "";
let bufferedMessageId = "";
let hydrationPromise: Promise<void> | null = null;
let cacheTimer: ReturnType<typeof setTimeout> | null = null;

const CONVERSATION_CACHE_KEY = "olivia:conversation:v2";

type ConversationCache = {
  version: 2;
  conversationId?: string;
  messages: OliviaV2Message[];
  savedAt: string;
};

function readConversationCache(): ConversationCache | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    const parsed = JSON.parse(localStorage.getItem(CONVERSATION_CACHE_KEY) || "null") as ConversationCache | null;
    return parsed?.version === 2 && Array.isArray(parsed.messages) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function removeConversationCache() {
  if (typeof window !== "undefined") localStorage.removeItem(CONVERSATION_CACHE_KEY);
}

function scheduleConversationCache(state: Pick<OliviaConversationState, "conversationId" | "messages">) {
  if (typeof window === "undefined") return;
  if (cacheTimer) clearTimeout(cacheTimer);
  cacheTimer = setTimeout(() => {
    cacheTimer = null;
    if (!state.messages.length && !state.conversationId) return;
    try {
      localStorage.setItem(CONVERSATION_CACHE_KEY, JSON.stringify({
        version: 2,
        conversationId: state.conversationId,
        messages: state.messages,
        savedAt: new Date().toISOString(),
      } satisfies ConversationCache));
    } catch { /* local storage unavailable */ }
  }, 180);
}

function newId(prefix: string) {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function textBlock(text: string): OliviaMessageBlock[] {
  return [{ type: "text", text }];
}

function normalizePersistedMessage(row: any): OliviaV2Message {
  const blocks = Array.isArray(row.metadata?.blocks) && row.metadata.blocks.length
    ? row.metadata.blocks
    : textBlock(String(row.content || ""));
  return {
    id: String(row.id || row.metadata?.clientRequestId || newId("message")),
    clientRequestId: row.metadata?.clientRequestId,
    role: row.role === "user" ? "user" : "assistant",
    content: String(row.content || ""),
    blocks,
    createdAt: row.created_at || new Date().toISOString(),
    status: "complete",
  };
}

function appendTextDelta(messages: OliviaV2Message[], messageId: string, delta: string) {
  return messages.map((message) => {
    if (message.id !== messageId) return message;
    const blocks = [...message.blocks];
    const last = blocks.at(-1);
    if (last?.type === "text") blocks[blocks.length - 1] = { ...last, text: last.text + delta };
    else blocks.push({ type: "text", text: delta });
    return { ...message, content: message.content + delta, blocks };
  });
}

function scheduleDeltaFlush(set: (partial: Partial<OliviaConversationState> | ((state: OliviaConversationState) => Partial<OliviaConversationState>)) => void) {
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    const delta = bufferedDelta;
    const messageId = bufferedMessageId;
    bufferedDelta = "";
    bufferedMessageId = "";
    flushTimer = null;
    if (delta && messageId) set((state) => ({ messages: appendTextDelta(state.messages, messageId, delta) }));
  }, 32);
}

function flushPendingDelta(set: (partial: Partial<OliviaConversationState> | ((state: OliviaConversationState) => Partial<OliviaConversationState>)) => void) {
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = null;
  if (bufferedDelta && bufferedMessageId) {
    const delta = bufferedDelta;
    const messageId = bufferedMessageId;
    bufferedDelta = "";
    bufferedMessageId = "";
    set((state) => ({ messages: appendTextDelta(state.messages, messageId, delta) }));
  }
}

async function readEventStream(response: Response, onEvent: (event: OliviaStreamEvent) => void) {
  if (!response.ok || !response.body) {
    const payload = await response.json().catch(() => null);
    throw new Error(payload?.error || "Olivia 응답을 시작하지 못했어요.");
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let boundary = buffer.indexOf("\n\n");
    while (boundary >= 0) {
      const raw = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      const dataLine = raw.split("\n").find((line) => line.startsWith("data:"));
      if (dataLine) onEvent(JSON.parse(dataLine.slice(5).trim()) as OliviaStreamEvent);
      boundary = buffer.indexOf("\n\n");
    }
  }
}

export const useOliviaConversationStore = create<OliviaConversationState>((set, get) => ({
  conversationId: undefined,
  messages: [],
  isHydrated: false,
  isSending: false,
  isStreaming: false,
  activeResponseId: undefined,
  agentStatus: undefined,
  lastFailedContent: undefined,

  appendMessage: (message) => set((state) => ({ messages: [...state.messages, message] })),
  updateMessage: (id, updates) => set((state) => ({
    messages: state.messages.map((message) => message.id === id ? { ...message, ...updates } : message),
  })),
  setMessages: (messages) => set({ messages }),
  setSending: (isSending) => set({ isSending }),
  setStreaming: (isStreaming) => set({ isStreaming }),
  setAgentStatus: (agentStatus) => set({ agentStatus }),
  clearConversation: () => {
    activeController?.abort();
    flushPendingDelta(set);
    set({
      conversationId: undefined,
      messages: [],
      isSending: false,
      isStreaming: false,
      activeResponseId: undefined,
      agentStatus: undefined,
      lastFailedContent: undefined,
    });
    useOliviaLayoutStore.getState().resetToIdle();
    removeConversationCache();
  },

  hydrate: async () => {
    if (get().isHydrated) return;
    if (!hydrationPromise) {
      hydrationPromise = (async () => {
        const cached = readConversationCache();
        if (cached?.messages.length && !get().messages.length) {
          set({ conversationId: cached.conversationId, messages: cached.messages });
          if (cached.messages.some((message) => message.role === "user")) useOliviaLayoutStore.getState().startConversation();
        }
        try {
          const response = await fetch("/api/olivia/v2/conversation", { cache: "no-store" });
          const data = await response.json();
          if (!response.ok || !data.ok) throw new Error(data.error);
          const persisted = Array.isArray(data.messages) ? data.messages.map(normalizePersistedMessage) : [];
          set((state) => ({
            conversationId: data.conversationId ?? state.conversationId,
            messages: cached?.conversationId && data.conversationId && cached.conversationId !== data.conversationId
              ? persisted
              : chooseConversationMessages(state.messages, persisted),
            isHydrated: true,
          }));
          if (get().messages.some((message) => message.role === "user")) {
            useOliviaLayoutStore.getState().startConversation();
          }
        } catch {
          set({ isHydrated: true });
        } finally {
          hydrationPromise = null;
        }
      })();
    }
    await hydrationPromise;
  },

  startNewConversation: async () => {
    activeController?.abort();
    const response = await fetch("/api/olivia/v2/conversation", { method: "POST" });
    const data = await response.json();
    if (!response.ok || !data.ok) throw new Error(data.error || "새 대화를 만들지 못했어요.");
    get().clearConversation();
    set({ conversationId: data.conversationId });
  },

  sendMessage: async (rawContent) => {
    const content = rawContent.trim();
    if (!content || get().isSending) return;
    const clientRequestId = newId("request");
    const userMessage: OliviaV2Message = {
      id: clientRequestId,
      clientRequestId,
      role: "user",
      content,
      blocks: textBlock(content),
      createdAt: new Date().toISOString(),
      status: "complete",
    };
    const responseId = newId("response");
    const assistantMessage: OliviaV2Message = {
      id: responseId,
      role: "assistant",
      content: "",
      blocks: [],
      createdAt: new Date().toISOString(),
      status: "streaming",
    };
    set((state) => ({
      messages: [...state.messages, userMessage, assistantMessage],
      isSending: true,
      isStreaming: true,
      activeResponseId: responseId,
      agentStatus: "생각 중…",
      lastFailedContent: undefined,
    }));
    useOliviaLayoutStore.getState().startConversation();

    activeController = new AbortController();
    try {
      const pathname = typeof location !== "undefined" ? location.pathname : undefined;
      const context = getOliviaContextSnapshot(pathname);
      const response = await fetch("/api/olivia/v2/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId: get().conversationId,
          clientRequestId,
          responseId,
          message: content,
          context,
          pageContext: buildOliviaPageContext(pathname),
        }),
        signal: activeController.signal,
      });
      await readEventStream(response, (event) => {
        if (event.type === "message_start") {
          set({ conversationId: event.conversationId ?? get().conversationId, activeResponseId: event.messageId });
        } else if (event.type === "text_delta") {
          bufferedMessageId = responseId;
          bufferedDelta += event.delta;
          scheduleDeltaFlush(set);
        } else if (event.type === "agent_status") {
          set({ agentStatus: event.status });
        } else if (event.type === "ui_action") {
          if (event.action.type === "REQUEST_APPROVAL") {
            const approval = event.action;
            set((state) => ({ messages: state.messages.map((message) => message.id === responseId ? {
              ...message,
              blocks: [...message.blocks, { type: "approval", approvalId: approval.approvalId, summary: approval.summary, toolName: approval.toolName, toolInput: approval.toolInput, confirmLabel: approval.confirmLabel, state: "pending" }],
            } : message) }));
          } else {
            executeOliviaAction(event.action);
          }
        } else if (event.type === "message_complete") {
          flushPendingDelta(set);
          set((state) => ({ messages: state.messages.map((message) => message.id === responseId ? { ...message, status: "complete" } : message) }));
        } else if (event.type === "error") {
          throw new Error(event.message);
        }
      });
    } catch (error) {
      flushPendingDelta(set);
      if ((error as any)?.name === "AbortError") {
        set((state) => ({ messages: state.messages.map((message) => message.id === responseId ? { ...message, status: "stopped" } : message) }));
      } else {
        set((state) => ({
          messages: state.messages.map((message) => message.id === responseId
            ? { ...message, status: "error", blocks: message.blocks.length ? message.blocks : [{ type: "error", message: "응답을 이어가지 못했어요. 다시 시도할까요?", retryable: true }] }
            : message),
          lastFailedContent: content,
        }));
      }
    } finally {
      activeController = null;
      set({ isSending: false, isStreaming: false, activeResponseId: undefined, agentStatus: undefined });
    }
  },

  stopResponse: () => activeController?.abort(),
  retryLast: async () => {
    const content = get().lastFailedContent;
    if (content) await get().sendMessage(content);
  },
  approveAction: async (approvalId, toolName, toolInput) => {
    set({ agentStatus: "승인한 작업을 처리하는 중…" });
    try {
      const pathname = typeof location !== "undefined" ? location.pathname : undefined;
      const response = await fetch("/api/olivia/v2/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ approvalId, toolName, toolInput, context: getOliviaContextSnapshot(pathname) }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.error || "승인 작업에 실패했어요.");
      for (const action of payload.uiActions || []) executeOliviaAction(action);
      set((state) => ({ messages: state.messages.map((message) => ({ ...message, blocks: message.blocks.map((block) => block.type === "approval" && block.approvalId === approvalId ? { ...block, state: "approved" as const } : block) })) }));
    } catch {
      set((state) => ({ messages: state.messages.map((message) => ({ ...message, blocks: message.blocks.map((block) => block.type === "approval" && block.approvalId === approvalId ? { ...block, state: "error" as const } : block) })) }));
    } finally {
      set({ agentStatus: undefined });
    }
  },
  cancelApproval: (approvalId) => set((state) => ({ messages: state.messages.map((message) => ({ ...message, blocks: message.blocks.map((block) => block.type === "approval" && block.approvalId === approvalId ? { ...block, state: "cancelled" as const } : block) })) })),
}));

useOliviaConversationStore.subscribe((state, previous) => {
  if (state.messages !== previous.messages || state.conversationId !== previous.conversationId) {
    scheduleConversationCache({ conversationId: state.conversationId, messages: state.messages });
  }
});
