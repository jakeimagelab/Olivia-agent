"use client";

import { create } from "zustand";
import { executeOliviaAction } from "@/lib/olivia/agent/actionRouter";
import { buildOliviaPageContext, getOliviaContextSnapshot, useOliviaContextStore } from "@/lib/store/oliviaContextStore";
import { useQuoteStore } from "@/lib/store/useQuoteStore";
// index.ts를 통해 import한다(registry.ts를 직접 import하면 안 됨) — index.ts가 builtins.ts를
// re-export하면서 select_match 등록 side effect를 트리거하기 때문이다.
import { getInlineTool, hasInProgressInlineTool } from "@/lib/olivia/inline-tools";
import { useOliviaLayoutStore } from "@/lib/store/useOliviaLayoutStore";
import type { OliviaMessageBlock, OliviaRunStreamPayload, OliviaStreamEvent, OliviaV2Message } from "@/lib/olivia/v2/types";
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
  // Task Session(코드 요청서 2026-08-17) — start_task_session/continue_task_session 도구가
  // 성공하면 여기 채워진다. components/olivia/OliviaTaskStrip.tsx가 이 값이 있을 때만 자기
  // 자신을 렌더링한다(61절 "어느 페이지에서도 Task Session 유지" — Persistent Chat과 같은
  // 컴포넌트 트리라 route 이동에도 그대로 남는다).
  activeTaskSessionId?: string;
  agentRuns: Record<string, OliviaRunStreamPayload>;
  appendMessage: (message: OliviaV2Message) => void;
  updateMessage: (id: string, updates: Partial<OliviaV2Message>) => void;
  setMessages: (messages: OliviaV2Message[]) => void;
  setSending: (value: boolean) => void;
  setStreaming: (value: boolean) => void;
  setAgentStatus: (status?: string) => void;
  setActiveTaskSessionId: (id?: string) => void;
  clearConversation: () => void;
  hydrate: () => Promise<void>;
  startNewConversation: () => Promise<void>;
  sendMessage: (content: string) => Promise<void>;
  stopResponse: () => void;
  retryLast: () => Promise<void>;
  approveAction: (approvalId: string, toolName: string, toolInput: Record<string, unknown>) => Promise<void>;
  cancelApproval: (approvalId: string) => void;
  setClientTaskBlockState: (flowId: string, state: "pending" | "in_progress" | "done" | "cancelled" | "error") => void;
  confirmShootConfirmation: (insightId: string) => Promise<void>;
  snoozeShootConfirmation: (insightId: string) => Promise<void>;
};

let activeController: AbortController | null = null;
// messageId별로 버퍼를 분리한다 — 예전에는 모듈 전역 단일 변수(bufferedDelta/bufferedMessageId)
// 하나를 모든 요청이 같이 썼는데, 이러면 두 요청이 겹칠 때 한쪽 delta가 다른 메시지로 새어
// 들어갈 여지가 이론상 있었다(현재는 isSending 가드가 사실상 막아주지만, 관례가 아니라
// 구조적으로 안전하게 만든다).
const pendingDeltas = new Map<string, { delta: string; timer: ReturnType<typeof setTimeout> | null }>();
let hydrationPromise: Promise<void> | null = null;
let cacheTimer: ReturnType<typeof setTimeout> | null = null;

const CONVERSATION_CACHE_KEY = "olivia:conversation:v2";

// 이 도구들이 실행되면(성공 시) OPEN_WORKSPACE/SWITCH_WORKSPACE ui_action이 뒤따른다 —
// lib/olivia/agent/uiActionResolvers.ts의 실제 매핑과 반드시 함께 유지. 결과가 오기 전
// tool_start 시점에 미리 알아서 워크스페이스 자리에 스켈레톤을 보여주기 위한 용도(Phase 4).
const WORKSPACE_OPENING_TOOLS = new Set(["create_quote", "create_contract", "create_conti", "show_workspace"]);

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

function notifyAgentCenter(){
  if(typeof window!=="undefined") window.dispatchEvent(new Event("olivia-agent-center-refresh"));
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

type SetFn = (partial: Partial<OliviaConversationState> | ((state: OliviaConversationState) => Partial<OliviaConversationState>)) => void;

function appendPendingDelta(messageId: string, delta: string) {
  const entry = pendingDeltas.get(messageId) ?? { delta: "", timer: null };
  entry.delta += delta;
  pendingDeltas.set(messageId, entry);
}

function scheduleDeltaFlush(set: SetFn, messageId: string) {
  const entry = pendingDeltas.get(messageId);
  if (!entry || entry.timer) return;
  entry.timer = setTimeout(() => {
    const current = pendingDeltas.get(messageId);
    pendingDeltas.delete(messageId);
    if (current?.delta) set((state) => ({ messages: appendTextDelta(state.messages, messageId, current.delta) }));
  }, 32);
}

// messageId를 넘기면 그 메시지의 버퍼만, 생략하면 남아있는 모든 버퍼를 내보낸다(대화 초기화 등
// 전체 정리가 필요한 지점에서 씀).
function flushPendingDelta(set: SetFn, messageId?: string) {
  const ids = messageId ? [messageId] : Array.from(pendingDeltas.keys());
  for (const id of ids) {
    const entry = pendingDeltas.get(id);
    if (!entry) continue;
    if (entry.timer) clearTimeout(entry.timer);
    pendingDeltas.delete(id);
    if (entry.delta) set((state) => ({ messages: appendTextDelta(state.messages, id, entry.delta) }));
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
  pendingWorkspaceOpen: false,
  lastFailedContent: undefined,
  activeTaskSessionId: undefined,
  agentRuns: {},

  appendMessage: (message) => set((state) => ({ messages: [...state.messages, message] })),
  updateMessage: (id, updates) => set((state) => ({
    messages: state.messages.map((message) => message.id === id ? { ...message, ...updates } : message),
  })),
  setMessages: (messages) => set({ messages }),
  setSending: (isSending) => set({ isSending }),
  setStreaming: (isStreaming) => set({ isStreaming }),
  setAgentStatus: (agentStatus) => set({ agentStatus }),
  setActiveTaskSessionId: (activeTaskSessionId) => set({ activeTaskSessionId }),
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
      pendingWorkspaceOpen: false,
      lastFailedContent: undefined,
      activeTaskSessionId: undefined,
      agentRuns: {},
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
    // "해줘"/"그냥해"처럼 키워드 없는 짧은 후속 확인 메시지만 보고 도구 목록을 고르면(server의
    // selectOliviaTools) 방금 전 메시지("견적서 만들어줘")에서 이미 정해진 주제(견적)의 도구가
    // 통째로 빠져서, 모델이 "그 도구가 연결되어 있지 않다"고 지어내는 사고가 있었다(2026-08-24
    // 사용자 리포트) — 직전 사용자 메시지 최근 2개를 같이 보내 주제가 이어지게 한다.
    const recentUserText = get().messages
      .filter((m) => m.role === "user")
      .slice(-2)
      .map((m) => m.content)
      .join(" ");
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
      pendingWorkspaceOpen: false,
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
          recentUserText,
          context,
          pageContext: buildOliviaPageContext(pathname),
        }),
        signal: activeController.signal,
      });
      await readEventStream(response, (event) => {
        if (event.type === "message_start") {
          set({ conversationId: event.conversationId ?? get().conversationId, activeResponseId: event.messageId });
        } else if (event.type === "text_delta") {
          appendPendingDelta(responseId, event.delta);
          scheduleDeltaFlush(set, responseId);
        } else if (event.type === "agent_status") {
          set({ agentStatus: event.status });
        } else if (event.type === "tool_start") {
          if (WORKSPACE_OPENING_TOOLS.has(event.tool)) set({ pendingWorkspaceOpen: true });
        } else if (event.type === "tool_result") {
          notifyAgentCenter();
          // "그거 다시 해줘"/"그것도" 같은 팔로우업이 방금 실행된 도구를 가리킬 수 있게, 성공한
          // 도구 호출마다 마지막 도구를 기록한다(open_feature처럼 순수 조회성 도구는 다음 요청의
          // 참조 대상으로 삼기엔 약하지만, 실패보다 기록해두는 쪽이 더 유용해서 성공 시 전부 기록).
          if (event.success) useOliviaContextStore.getState().setLastToolIntent(event.tool);
          // 문서를 열었거나(open_document) 검색 결과가 1건으로 확실하면(search_documents) "이
          // 문서"/"여기에"류 후속 요청이 다시 검색하지 않고 바로 그 문서를 가리키도록 기록한다.
          if (event.success && event.tool === "open_document") {
            const data = event.result as { resourceId?: string; workspace?: string; hospitalName?: string } | undefined;
            if (data?.resourceId) useOliviaContextStore.getState().setCurrentDocument(data.resourceId, data.workspace, data.hospitalName);
          }
          if (event.success && event.tool === "search_documents") {
            const data = event.result as { matched?: boolean; documents?: Array<{ id: string; type: string; title: string }> } | undefined;
            if (data?.matched && data.documents?.[0]) {
              const doc = data.documents[0];
              useOliviaContextStore.getState().setCurrentDocument(doc.id, doc.type, doc.title);
            }
          }
          if (event.success && (event.tool === "start_task_session" || event.tool === "continue_task_session")) {
            const sessionId = (event.result as { sessionId?: string } | undefined)?.sessionId;
            if (sessionId) set({ activeTaskSessionId: sessionId });
          } else if (event.success && event.tool === "pause_task_session") {
            set({ activeTaskSessionId: undefined });
          }
        } else if (event.type === "ui_action") {
          if (event.action.type === "REQUEST_APPROVAL") {
            const approval = event.action;
            set((state) => ({ messages: state.messages.map((message) => message.id === responseId ? {
              ...message,
              blocks: [...message.blocks, { type: "approval", approvalId: approval.approvalId, summary: approval.summary, toolName: approval.toolName, toolInput: approval.toolInput, confirmLabel: approval.confirmLabel, state: "pending" }],
            } : message) }));
          } else if (event.action.type === "DOWNLOAD_QUOTE_PDF") {
            // PDF는 브라우저에 열려 있는 QuoteBuilder만 실제로 만들 수 있다(html2canvas가 DOM을
            // 캡처한다) — 서버 tool의 success:true는 "요청을 접수했다"일 뿐, 진짜 성공/실패는
            // 사람이 누르는 다운로드 버튼과 같은 downloadPdf()가 끝난 뒤에만 확정된다(Phase 4).
            // executeOliviaAction으로 안 보내는 이유는 actionRouter.ts가 이 스토어를 다시
            // import하면 순환 참조가 되기 때문 — REQUEST_APPROVAL/OPEN_CLIENT_TASK와 같은
            // 이유로 여기서 가로챈다. PDF 생성은 수 초 걸릴 수 있어 원래 스트리밍 메시지가 이미
            // 끝났을 수 있으므로, 결과는 새 assistant 메시지로 따로 보고한다.
            const handler = useQuoteStore.getState().pdfHandler;
            if (!handler) {
              get().appendMessage({
                id: crypto.randomUUID(),
                role: "assistant",
                content: "지금 열려 있는 견적서가 없어서 PDF를 만들지 못했어요.",
                blocks: [{ type: "text", text: "지금 열려 있는 견적서가 없어서 PDF를 만들지 못했어요." }],
                createdAt: new Date().toISOString(),
                status: "complete",
              });
            } else {
              void handler().then((result) => {
                const text = result.success
                  ? "현재 견적서 기준으로 PDF 다운로드를 완료했어요."
                  : (result.error || "PDF 생성에 실패했어요.");
                get().appendMessage({
                  id: crypto.randomUUID(),
                  role: "assistant",
                  content: text,
                  blocks: [{ type: "text", text }],
                  createdAt: new Date().toISOString(),
                  status: "complete",
                });
              });
            }
          } else if (event.action.type === "OPEN_CLIENT_TASK") {
            // 채팅 안에서 실제 작업을 끝까지 수행하는 카드(예: 셀렉 매칭) — approval과 동일하게
            // 여기서 미리 가로채 메시지에 블록을 추가한다. 실시간 진행 상태는 도구별 client-only
            // 스토어가 갖고(Inline Tool Registry, lib/olivia/inline-tools), 이 블록은 flowId
            // 참조만 들고 있다. 같은 task가 이미 in_progress면 새로 시작하지 않고 안내만 한다.
            const openTask = event.action;
            const definition = getInlineTool(openTask.task);
            if (hasInProgressInlineTool(get().messages, openTask.task)) {
              const notice = definition?.duplicateRunMessage ?? "현재 작업이 진행 중입니다. 완료 후 다시 시도해주세요.";
              get().appendMessage({
                id: crypto.randomUUID(),
                role: "assistant",
                content: notice,
                blocks: [{ type: "text", text: notice }],
                createdAt: new Date().toISOString(),
                status: "complete",
              });
            } else {
              definition?.onStart?.(openTask.flowId);
              // pending이 아니라 in_progress로 바로 시작한다 — 카드가 뜬 순간부터 이미 Tool
              // Session이 시작된 것으로 본다. pending으로 두면 사용자가 첫 화면(모드 선택)에서
              // 아직 아무 버튼도 안 눌렀을 때 같은 요청을 또 하면 위 중복 감지(hasInProgressInlineTool)를
              // 통과하지 못해 카드가 중복 생성될 수 있었다. quote_preview처럼 완료 개념이 없는
              // 상시-live 카드는 definition.initialState로 "done"을 지정해 이 기본값을 우회한다.
              const initialState = definition?.initialState ?? "in_progress";
              set((state) => ({ messages: state.messages.map((message) => message.id === responseId ? {
                ...message,
                blocks: [...message.blocks, { type: "client_task", flowId: openTask.flowId, task: openTask.task, state: initialState }],
              } : message) }));
            }
          } else {
            if (event.action.type === "OPEN_WORKSPACE" || event.action.type === "SWITCH_WORKSPACE") set({ pendingWorkspaceOpen: false });
            executeOliviaAction(event.action);
          }
        } else if (event.type.startsWith("run_")) {
          const runEvent=event as Extract<OliviaStreamEvent,{type:"run_created"|"run_updated"|"run_step_updated"|"run_waiting_approval"|"run_completed"|"run_failed"}>;
          set((state)=>({agentRuns:{...state.agentRuns,[runEvent.run.id]:{...state.agentRuns[runEvent.run.id],...runEvent.run}}}));
          notifyAgentCenter();
        } else if (event.type === "message_complete") {
          flushPendingDelta(set, responseId);
          set((state) => ({ messages: state.messages.map((message) => message.id === responseId ? { ...message, status: "complete" } : message) }));
        } else if (event.type === "error") {
          throw new Error(event.message);
        }
      });
    } catch (error) {
      flushPendingDelta(set, responseId);
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
      // 도구가 실패했거나 응답이 중단되면 OPEN_WORKSPACE가 끝내 안 올 수 있다 — 스켈레톤이
      // 영원히 남지 않도록 스트림이 끝나는 시점에 항상 정리한다.
      set({ isSending: false, isStreaming: false, activeResponseId: undefined, agentStatus: undefined, pendingWorkspaceOpen: false });
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
      notifyAgentCenter();
      set((state) => ({ messages: state.messages.map((message) => ({ ...message, blocks: message.blocks.map((block) => block.type === "approval" && block.approvalId === approvalId ? { ...block, state: "approved" as const } : block) })) }));
    } catch {
      set((state) => ({ messages: state.messages.map((message) => ({ ...message, blocks: message.blocks.map((block) => block.type === "approval" && block.approvalId === approvalId ? { ...block, state: "error" as const } : block) })) }));
    } finally {
      set({ agentStatus: undefined });
    }
  },
  cancelApproval: (approvalId) => set((state) => ({ messages: state.messages.map((message) => ({ ...message, blocks: message.blocks.map((block) => block.type === "approval" && block.approvalId === approvalId ? { ...block, state: "cancelled" as const } : block) })) })),
  setClientTaskBlockState: (flowId, blockState) => set((state) => ({ messages: state.messages.map((message) => ({ ...message, blocks: message.blocks.map((block) => block.type === "client_task" && block.flowId === flowId ? { ...block, state: blockState } : block) })) })),

  confirmShootConfirmation: async (insightId) => {
    const mark = (state: "confirmed" | "error") => set((current) => ({
      messages: current.messages.map((message) => ({
        ...message,
        blocks: message.blocks.map((block) => block.type === "shoot_confirm" && block.insightId === insightId ? { ...block, state } : block),
      })),
    }));
    try {
      const response = await fetch(`/api/olivia/shoot-confirmations/${insightId}/confirm`, { method: "POST" });
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.error || "다음 단계로 넘기지 못했어요.");
      mark("confirmed");
    } catch {
      mark("error");
    }
  },
  snoozeShootConfirmation: async (insightId) => {
    const mark = (state: "snoozed" | "error") => set((current) => ({
      messages: current.messages.map((message) => ({
        ...message,
        blocks: message.blocks.map((block) => block.type === "shoot_confirm" && block.insightId === insightId ? { ...block, state } : block),
      })),
    }));
    try {
      const response = await fetch(`/api/olivia/insights/${insightId}/dismiss`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reason: "아직 촬영 전/확인 전" }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.error || "미루지 못했어요.");
      mark("snoozed");
    } catch {
      mark("error");
    }
  },
}));

useOliviaConversationStore.subscribe((state, previous) => {
  if (state.messages !== previous.messages || state.conversationId !== previous.conversationId) {
    scheduleConversationCache({ conversationId: state.conversationId, messages: state.messages });
  }
});
