import { describe, expect, it } from "vitest";
import { registerInlineTool, getInlineTool, hasInlineTool } from "@/lib/olivia/inline-tools/registry";

function FakeComponent() {
  return null;
}

describe("Inline Tool Registry", () => {
  it("registers and retrieves a tool definition by id", () => {
    registerInlineTool({ id: "test_tool_registry_a", component: FakeComponent as any });
    expect(hasInlineTool("test_tool_registry_a")).toBe(true);
    expect(getInlineTool("test_tool_registry_a")?.component).toBe(FakeComponent);
  });

  it("returns undefined for an unknown tool id", () => {
    expect(getInlineTool("nonexistent_tool_xyz")).toBeUndefined();
  });

  it("throws when registering a duplicate id", () => {
    registerInlineTool({ id: "test_tool_registry_b", component: FakeComponent as any });
    expect(() => registerInlineTool({ id: "test_tool_registry_b", component: FakeComponent as any })).toThrow();
  });
});
