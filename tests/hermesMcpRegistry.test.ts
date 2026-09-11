import { describe, expect, it } from "vitest";
import { createOliviaHermesMcpServer } from "@/lib/hermes/mcpServer";
import { OLIVIA_V2_TOOLS } from "@/lib/olivia/v2/toolExecutor";
import { listHermesOliviaTools } from "@/lib/hermes/mcp/oliviaToolBridge";
import { BLOCKED_TOOLS, getHermesToolPolicy } from "@/lib/hermes/mcp/exposurePolicy";

describe("Olivia Hermes MCP registry", () => {
  it("domain registrations를 중복 없이 구성한다", () => {
    expect(() => createOliviaHermesMcpServer()).not.toThrow();
  });

  it("Olivia registry의 비차단 Tool을 누락 없이 자동 노출한다", () => {
    const expected = OLIVIA_V2_TOOLS.map((tool) => tool.name).filter((name) => !BLOCKED_TOOLS.has(name)).sort();
    const actual = listHermesOliviaTools().map((tool) => tool.name).sort();
    expect(new Set(actual).size).toBe(actual.length);
    expect(actual).toEqual(expected);
  });

  it("새 Tool의 기본 노출 정책은 OPEN이다", () => {
    expect(getHermesToolPolicy("future_olivia_tool")).toBe("open");
  });

  it("requestId만 MCP correlation 필드로 schema에 자동 합성한다", () => {
    const source = OLIVIA_V2_TOOLS.find((tool) => tool.name === "calendar_add")!;
    const exposed = listHermesOliviaTools().find((tool) => tool.name === "calendar_add")!;
    expect(exposed.inputSchema).not.toBe(source.parameters);
    expect((exposed.inputSchema.properties as Record<string, unknown>).requestId).toBeTruthy();
    expect(source.parameters!.properties).not.toHaveProperty("requestId");
  });
});
