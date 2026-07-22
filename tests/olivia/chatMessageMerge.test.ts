import { describe, expect, it } from "vitest";
import { mergeChatMessages, type MergeableChatMessage } from "@/lib/olivia/chatMessageMerge";

describe("mergeChatMessages", () => {
  it("replaces an optimistic message with its persisted DB row", () => {
    const optimistic: MergeableChatMessage = {
      role: "user",
      content: "헬로?",
      source: "web",
      clientRequestId: "request-1",
      createdAt: "2026-07-23T01:00:00.000Z",
    };
    const persisted: MergeableChatMessage = {
      id: "db-1",
      role: "user",
      content: "헬로?",
      source: "web",
      clientRequestId: "request-1",
      createdAt: "2026-07-23T01:00:00.100Z",
    };

    expect(mergeChatMessages([optimistic], [persisted])).toEqual([{ ...persisted }]);
  });

  it("reconciles a polling row when a legacy DB drops metadata", () => {
    const optimistic: MergeableChatMessage = {
      role: "assistant",
      content: "네, 여기 있어요!",
      source: "web",
      clientRequestId: "request-2",
      createdAt: "2026-07-23T01:00:00.000Z",
    };
    const polled: MergeableChatMessage = {
      id: "db-2",
      role: "assistant",
      content: "네, 여기 있어요!",
      source: "web",
      createdAt: "2026-07-23T01:00:01.000Z",
    };

    expect(mergeChatMessages([optimistic], [polled])).toEqual([
      expect.objectContaining({ id: "db-2", clientRequestId: "request-2" }),
    ]);
  });

  it("keeps the same text when it is intentionally sent later", () => {
    const earlier: MergeableChatMessage = {
      id: "db-1",
      role: "user",
      content: "헬로?",
      source: "web",
      createdAt: "2026-07-23T01:00:00.000Z",
    };
    const later: MergeableChatMessage = {
      id: "db-2",
      role: "user",
      content: "헬로?",
      source: "web",
      createdAt: "2026-07-23T01:02:00.000Z",
    };

    expect(mergeChatMessages([earlier], [later])).toHaveLength(2);
  });
});
