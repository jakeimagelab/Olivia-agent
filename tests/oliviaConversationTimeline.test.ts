import { describe, expect, it } from "vitest";
import { buildConversationExchanges, chooseConversationMessages, groupExchangesByDate } from "@/lib/olivia/conversationTimeline";
import type { OliviaV2Message } from "@/lib/olivia/v2/types";

function message(id: string, role: "user" | "assistant", content: string, createdAt: string): OliviaV2Message {
  return { id, role, content, createdAt, blocks: [{ type: "text", text: content }], status: "complete" };
}

describe("Olivia conversation timeline", () => {
  const messages = [
    message("u1", "user", "오늘 일정 알려줘", "2026-08-12T00:10:00.000Z"),
    message("a1", "assistant", "오늘은 촬영 일정이 있어요.", "2026-08-12T00:10:01.000Z"),
    message("u2", "user", "견적 보여줘", "2026-08-13T00:10:00.000Z"),
    message("a2", "assistant", "견적서를 열었어요.", "2026-08-13T00:10:01.000Z"),
  ];

  it("builds one navigation exchange for each user-led turn", () => {
    const exchanges = buildConversationExchanges(messages);
    expect(exchanges).toHaveLength(2);
    expect(exchanges[0]).toMatchObject({ userMessageId: "u1", userText: "오늘 일정 알려줘", assistantText: "오늘은 촬영 일정이 있어요." });
  });

  it("groups navigation anchors by Seoul date", () => {
    expect(groupExchangesByDate(buildConversationExchanges(messages))).toHaveLength(2);
  });

  it("keeps a newer optimistic cache but accepts a newer server history", () => {
    expect(chooseConversationMessages(messages, messages.slice(0, 2))).toBe(messages);
    const newerServer = [...messages, message("u3", "user", "콘티 보여줘", "2026-08-13T01:00:00.000Z")];
    expect(chooseConversationMessages(messages, newerServer)).toBe(newerServer);
  });
});
