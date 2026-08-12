import { beforeEach, describe, expect, it } from "vitest";
import { useOliviaConversationStore } from "@/lib/store/useOliviaConversationStore";
import type { OliviaMessage } from "@/lib/olivia/v2/types";

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
});
