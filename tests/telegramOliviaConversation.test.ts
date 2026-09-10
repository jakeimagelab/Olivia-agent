import { describe, expect, it, vi } from "vitest";
import { mergeConversationMessages } from "@/lib/olivia/conversationTimeline";
import {
  deliverTelegramAssistantMessage,
  telegramAssistantExternalId,
  telegramInboundExternalId,
} from "@/lib/assistant/telegram/service";
import type { OliviaV2Message } from "@/lib/olivia/v2/types";
import { saveAssistantMessage } from "@/lib/assistant/conversations/service";

function message(input: Partial<OliviaV2Message> & Pick<OliviaV2Message, "id" | "role" | "content" | "createdAt">): OliviaV2Message {
  return { blocks: [{ type: "text", text: input.content }], status: "complete", ...input };
}

describe("Telegram ↔ Olivia canonical conversation", () => {
  it("uses a chat-scoped Telegram external id for webhook deduplication", () => {
    expect(telegramInboundExternalId("100", 42)).toBe("telegram:100:42");
    expect(telegramInboundExternalId("100", 42)).not.toBe(telegramInboundExternalId("200", 42));
    expect(telegramAssistantExternalId("100", 42)).toBe("telegram:100:42:assistant");
  });

  it("stores the same Telegram message_id only once", async () => {
    const rows = new Map<string, Record<string, unknown>>();
    const fakeDb = {
      from(table: string) {
        let operation = "select";
        let pending: Record<string, unknown> = {};
        const filters = new Map<string, unknown>();
        const chain: any = {
          insert(value: Record<string, unknown>) { operation = "insert"; pending = value; return chain; },
          update(value: Record<string, unknown>) { operation = "update"; pending = value; return chain; },
          select() { return chain; },
          eq(column: string, value: unknown) { filters.set(column, value); return chain; },
          single: async () => {
            if (table === "assistant_conversations") return { data: { id: "conversation-1" }, error: null };
            const key = String(pending.external_message_id || filters.get("external_message_id"));
            if (operation === "insert") {
              if (rows.has(key)) return { data: null, error: { code: "23505", message: "duplicate" } };
              const row = { id: "message-1", created_at: "2026-09-10T03:00:00.000Z", ...pending };
              rows.set(key, row);
              return { data: row, error: null };
            }
            return { data: rows.get(key), error: null };
          },
        };
        return chain;
      },
    };
    const input = {
      ownerId: "owner-1",
      conversationId: "conversation-1",
      role: "user" as const,
      content: "내일 일정 등록해줘",
      channel: "telegram" as const,
      externalMessageId: "telegram:100:42",
    };
    const first = await saveAssistantMessage(fakeDb as any, input);
    const duplicate = await saveAssistantMessage(fakeDb as any, input);
    expect(first.duplicate).toBe(false);
    expect(duplicate).toMatchObject({ duplicate: true, message: { id: "message-1" } });
    expect(rows.size).toBe(1);
  });

  it("stores Web and Telegram turns in the same canonical conversation", async () => {
    const inserted: Array<Record<string, unknown>> = [];
    const fakeDb = {
      from(table: string) {
        let pending: Record<string, unknown> = {};
        const chain: any = {
          insert(value: Record<string, unknown>) { pending = value; inserted.push(value); return chain; },
          update() { return chain; },
          select() { return chain; },
          eq() { return chain; },
          single: async () => ({
            data: table === "olivia_chat_messages"
              ? { id: `message-${inserted.length}`, created_at: `2026-09-10T03:00:0${inserted.length}.000Z`, ...pending }
              : { id: "conversation-1" },
            error: null,
          }),
        };
        return chain;
      },
    };
    await saveAssistantMessage(fakeDb as any, {
      ownerId: "owner-1", conversationId: "conversation-1", role: "user", content: "Desktop 질문", channel: "web",
    });
    await saveAssistantMessage(fakeDb as any, {
      ownerId: "owner-1", conversationId: "conversation-1", role: "assistant", content: "Telegram 답변", channel: "telegram",
    });
    expect(inserted).toEqual([
      expect.objectContaining({ owner_id: "owner-1", conversation_id: "conversation-1", channel: "web" }),
      expect.objectContaining({ owner_id: "owner-1", conversation_id: "conversation-1", channel: "telegram" }),
    ]);
  });

  it("merges Web and Telegram messages in created_at order", () => {
    const merged = mergeConversationMessages([], [
      message({ id: "3", role: "assistant", content: "Telegram 답변", channel: "telegram", createdAt: "2026-09-10T03:00:02.000Z" }),
      message({ id: "1", role: "user", content: "Web 질문", channel: "web", createdAt: "2026-09-10T03:00:00.000Z" }),
      message({ id: "2", role: "user", content: "Telegram 질문", channel: "telegram", createdAt: "2026-09-10T03:00:01.000Z" }),
    ]);
    expect(merged.map((entry) => entry.content)).toEqual(["Web 질문", "Telegram 질문", "Telegram 답변"]);
    expect(merged.map((entry) => entry.channel)).toEqual(["web", "telegram", "telegram"]);
  });

  it("replaces an optimistic Web message with its canonical DB row", () => {
    const optimistic = message({
      id: "request-1",
      clientRequestId: "request-1",
      role: "user",
      content: "견적서 열어줘",
      status: "sending",
      createdAt: "2026-09-10T03:00:00.000Z",
    });
    const persisted = message({
      id: "db-1",
      clientRequestId: "request-1",
      externalMessageId: "request-1",
      role: "user",
      content: "견적서 열어줘",
      channel: "web",
      createdAt: "2026-09-10T03:00:00.100Z",
    });
    expect(mergeConversationMessages([optimistic], [persisted]).map((entry) => entry.id)).toEqual(["db-1"]);
  });

  it("keeps the assistant message and marks only delivery failed when Telegram send fails", async () => {
    const updates: Array<{ table: string; patch: Record<string, unknown> }> = [];
    const fakeDb = {
      from(table: string) {
        let operation = "select";
        let patch: Record<string, unknown> = {};
        const chain: any = {
          select() { operation = "select"; return chain; },
          insert(value: Record<string, unknown>) { operation = "insert"; patch = value; return chain; },
          update(value: Record<string, unknown>) { operation = "update"; patch = value; updates.push({ table, patch: value }); return chain; },
          eq() { return chain; },
          maybeSingle: async () => ({ data: null, error: null }),
          single: async () => ({
            data: table === "assistant_delivery_attempts" ? { id: "attempt-1" } : { id: "assistant-1", ...patch },
            error: null,
            operation,
          }),
        };
        return chain;
      },
    };
    const send = vi.fn(async () => { throw new Error("telegram offline"); });
    await expect(deliverTelegramAssistantMessage(fakeDb as any, {
      ownerId: "owner-1",
      conversationId: "conversation-1",
      messageId: "assistant-1",
      externalRequestId: "telegram:100:42:assistant",
      send,
    })).rejects.toThrow("telegram offline");
    expect(send).toHaveBeenCalledOnce();
    expect(updates).toContainEqual({ table: "olivia_chat_messages", patch: { delivery_status: "failed" } });
    expect(updates.some((entry) => entry.table === "olivia_chat_messages" && "deleted_at" in entry.patch)).toBe(false);
  });
});
