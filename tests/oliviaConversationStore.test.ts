import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useOliviaConversationStore } from "@/lib/store/useOliviaConversationStore";
import type { OliviaMessage } from "@/lib/olivia/v2/types";
import { useOliviaContextStore } from "@/lib/store/oliviaContextStore";
import { useWorkspaceStore } from "@/lib/store/workspaceStore";

const message: OliviaMessage = {
  id: "message-1",
  role: "user",
  content: "안녕 올리비아",
  blocks: [{ type: "text", text: "안녕 올리비아" }],
  createdAt: "2026-08-12T00:00:00.000Z",
  status: "complete",
};

describe("Olivia conversation store", () => {
  beforeEach(() => {
    useOliviaContextStore.getState().clearWindowLink();
    useWorkspaceStore.getState().closeWorkspace();
    useOliviaConversationStore.setState({
      conversationId: undefined,
      messages: [],
      isHydrated: true,
      isSending: false,
      isStreaming: false,
      activeResponseId: undefined,
      agentStatus: undefined,
      lastFailedContent: undefined,
    });
  });

  afterEach(() => vi.unstubAllGlobals());

  it("keeps one runtime messages array for every subscriber", () => {
    const firstSubscriber = useOliviaConversationStore.getState;
    const secondSubscriber = useOliviaConversationStore.getState;

    useOliviaConversationStore.getState().appendMessage(message);

    expect(firstSubscriber().messages).toBe(secondSubscriber().messages);
    expect(firstSubscriber().messages).toEqual([message]);
  });

  it("updates messages and shared loading state through store actions", () => {
    const store = useOliviaConversationStore.getState();
    store.appendMessage(message);
    store.updateMessage(message.id, { status: "streaming" });
    store.setSending(true);
    store.setStreaming(true);
    store.setAgentStatus("확인 중…");

    const next = useOliviaConversationStore.getState();
    expect(next.messages[0].status).toBe("streaming");
    expect(next.isSending).toBe(true);
    expect(next.isStreaming).toBe(true);
    expect(next.agentStatus).toBe("확인 중…");
  });

  it("새 대화는 이전 대화와 화면의 고객·문서·작업 연결을 함께 초기화한다", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, conversationId: "conversation-new" }),
    }));
    useOliviaContextStore.getState().setClient("client-old", "1989 청담 스시", "conversation");
    useOliviaContextStore.getState().setWorkspace("quote", "quote-old");
    useOliviaContextStore.getState().setCurrentDocument("quote-old", "quote", "1989 청담 스시 견적서");
    useWorkspaceStore.getState().openWorkspace("quote", {
      clientId: "client-old",
      clientName: "1989 청담 스시",
      resourceId: "quote-old",
      workspaceTitle: "1989 청담 스시 견적서",
    });
    useOliviaConversationStore.getState().appendMessage(message);

    await useOliviaConversationStore.getState().startNewConversation();

    expect(useOliviaConversationStore.getState()).toMatchObject({
      conversationId: "conversation-new",
      messages: [],
    });
    expect(useOliviaContextStore.getState()).toMatchObject({
      activeClientId: undefined,
      activeWorkspace: undefined,
      currentDocumentId: undefined,
      recentEntities: [],
    });
    expect(useWorkspaceStore.getState()).toMatchObject({
      type: null,
      mode: "home",
      clientName: undefined,
      workspaceTitle: undefined,
    });
  });
});
