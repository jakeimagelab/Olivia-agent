import { describe, expect, it } from "vitest";
import { createOliviaHermesMcpServer } from "@/lib/hermes/mcpServer";
import { OLIVIA_V2_TOOLS } from "@/lib/olivia/v2/toolExecutor";
import { executeHermesOliviaTool, listHermesOliviaTools } from "@/lib/hermes/mcp/oliviaToolBridge";
import { BLOCKED_TOOLS, getHermesToolMode, getHermesToolPolicy, isDangerousToolName } from "@/lib/hermes/mcp/exposurePolicy";

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

  // Olivia OS 2.0 §7 — DANGEROUS는 이름 패턴만으로도 코드 레벨에서 차단되어야 한다(Prompt 의존 금지).
  it.each([
    "delete_raw_photos", "move_raw_files", "remove_raw_asset", "raw_file_delete",
    "exec_shell", "run_shell", "shell_command_run", "system_config_update", "format_disk_now",
  ])("위험한 이름의 Tool '%s'는 이름만으로 자동 차단된다", (toolName) => {
    expect(isDangerousToolName(toolName)).toBe(true);
    expect(getHermesToolPolicy(toolName)).toBe("blocked");
  });

  it("정상적인 파일/사진 관련 Tool 이름은 위험 패턴에 걸리지 않는다", () => {
    for (const toolName of ["list_photo_storage_projects", "get_photo_storage_status", "retry_photo_storage_project", "download_quote_pdf"]) {
      expect(isDangerousToolName(toolName)).toBe(false);
    }
  });

  it("실제 등록된 Tool 중 위험 이름 패턴에 걸리는 것이 없다(회귀 방지)", () => {
    const flagged = OLIVIA_V2_TOOLS.map((tool) => tool.name).filter((name) => isDangerousToolName(name));
    expect(flagged).toEqual([]);
  });

  it("requestId만 MCP correlation 필드로 schema에 자동 합성한다", () => {
    const source = OLIVIA_V2_TOOLS.find((tool) => tool.name === "calendar_add")!;
    const exposed = listHermesOliviaTools().find((tool) => tool.name === "calendar_add")!;
    expect(exposed.inputSchema).not.toBe(source.parameters);
    expect((exposed.inputSchema.properties as Record<string, unknown>).requestId).toBeTruthy();
    expect(source.parameters!.properties).not.toHaveProperty("requestId");
  });

  // 요청서 §18-5 — Hermes가 존재하지 않는 Tool을 호출해도 앱은 안전하게 실패해야 한다.
  it("존재하지 않는 Tool 호출은 예외를 던지지 않고 안전하게 실패한다", async () => {
    const response = await executeHermesOliviaTool({ toolName: "no_such_tool_at_all", input: {} });
    expect(response.isError).toBe(true);
    const payload = JSON.parse(response.content[0].text as string);
    expect(payload).toMatchObject({ success: false, code: "TOOL_NOT_AVAILABLE" });
  });

  // 차단된 Tool(BLOCKED_TOOLS/DANGEROUS)은 존재하더라도 실행 자체가 거부되어야 한다(§6 DENY).
  it("BLOCKED 정책의 Tool은 존재해도 실행이 거부된다", async () => {
    const blockedName = [...BLOCKED_TOOLS][0];
    const response = await executeHermesOliviaTool({ toolName: blockedName, input: {} });
    expect(response.isError).toBe(true);
    const payload = JSON.parse(response.content[0].text as string);
    expect(payload.success).toBe(false);
  });

  // client_search는 이름이 "search_"로 시작하지 않아(끝에 붙는 형태) getHermesToolMode()의
  // 이름 접두사 정규식만으로는 mutation으로 떨어진다. 하지만 실제 호출부(oliviaToolBridge.ts의
  // executeHermesOliviaTool)는 항상 definition.description(항상 "[READ] ..."로 시작)을 같이
  // 넘기므로 실제로는 그 description 우선 체크로 이미 올바르게 read로 분류된다 — 이름만으로 호출한
  // 조사는 false positive였다. 그래도 이름만으로도 안전하게 read가 나오도록 EXPLICIT_READ_TOOLS류
  // 목록에 client_search를 추가해(exposurePolicy.ts) description이 비어 있는 호출부가 생기더라도
  // 안전하게 만들었다 — 이 테스트는 그 방어선을 검증한다(description 없이 호출해도 read).
  it("client_search는 description 없이 이름만으로도 read로 분류된다(방어선)", () => {
    expect(getHermesToolMode("client_search")).toBe("read");
  });

  it("실제 호출 경로와 동일하게 OLIVIA_V2_TOOLS의 진짜 description을 넘기면 client_get/list/search류가 전부 read로 분류된다", () => {
    for (const name of ["client_search", "client_get", "memo_list", "memo_search", "memo_get", "calendar_list"]) {
      const definition = OLIVIA_V2_TOOLS.find((tool) => tool.name === name)!;
      expect(getHermesToolMode(name, definition.description ?? "")).toBe("read");
    }
  });

  it("create_quote MCP schema가 자연어 견적 V2 필드와 서비스 수정 도구를 노출한다", () => {
    const createQuote = listHermesOliviaTools().find((tool) => tool.name === "create_quote")!;
    const properties = createQuote.inputSchema.properties as Record<string, unknown>;
    expect(properties).toHaveProperty("pricingMode");
    expect(properties).toHaveProperty("customUnitPrice");
    expect(properties).toHaveProperty("customTotalPrice");
    expect(properties).toHaveProperty("includedServices");
    expect(listHermesOliviaTools().map((tool) => tool.name)).toContain("update_quote_service");
  });
});
