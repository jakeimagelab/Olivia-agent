import { describe, expect, it } from "vitest";
import { hasInProgressInlineTool } from "@/lib/olivia/inline-tools/registry";
import type { OliviaMessage } from "@/lib/olivia/v2/types";

function messageWithBlock(task: string, state: "pending" | "in_progress" | "done"): OliviaMessage {
  return {
    id: "m1",
    role: "assistant",
    content: "",
    status: "complete",
    blocks: [{ type: "client_task", flowId: "f1", task, state }],
  };
}

describe("Inline tool duplicate-run guard", () => {
  it("detects an in_progress flow for the same task", () => {
    expect(hasInProgressInlineTool([messageWithBlock("select_match", "in_progress")], "select_match")).toBe(true);
  });

  it("ignores pending/done flows and different task ids", () => {
    expect(hasInProgressInlineTool([messageWithBlock("select_match", "pending")], "select_match")).toBe(false);
    expect(hasInProgressInlineTool([messageWithBlock("select_match", "done")], "select_match")).toBe(false);
    expect(hasInProgressInlineTool([messageWithBlock("other_tool", "in_progress")], "select_match")).toBe(false);
  });

  it("returns false for an empty message list", () => {
    expect(hasInProgressInlineTool([], "select_match")).toBe(false);
  });
});
