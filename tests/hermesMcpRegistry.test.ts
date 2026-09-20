import { afterEach, describe, expect, it, vi } from "vitest";
import { createOliviaHermesMcpServer } from "@/lib/hermes/mcpServer";
import { OLIVIA_V2_TOOLS } from "@/lib/olivia/v2/toolExecutor";
import { executeHermesOliviaTool, listHermesOliviaTools } from "@/lib/hermes/mcp/oliviaToolBridge";
import { BLOCKED_TOOLS, getHermesToolMode, getHermesToolPolicy, isDangerousToolName } from "@/lib/hermes/mcp/exposurePolicy";
import { clearHermesExecutionContext, registerHermesExecutionContext } from "@/lib/hermes/executionContext";

describe("Olivia Hermes MCP registry", () => {
  it("domain registrations를 중복 없이 구성한다", () => {
    expect(() => createOliviaHermesMcpServer()).not.toThrow();
  });

  it("Olivia registry의 비차단 Tool을 누락 없이 자동 노출한다", () => {
    const expected = OLIVIA_V2_TOOLS.map((tool) => tool.name).filter((name) => getHermesToolPolicy(name) !== "blocked").sort();
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

  it("일정 생성은 calendar_add만 담당하고 범용 create_feature_record는 calendar를 노출하지 않는다", () => {
    const createFeature = listHermesOliviaTools().find((tool) => tool.name === "create_feature_record")!;
    const domain = (createFeature.inputSchema.properties as Record<string, { enum?: string[] }>).domain;
    expect(domain.enum).not.toContain("calendar");
    expect(listHermesOliviaTools().map((tool) => tool.name)).toContain("calendar_add");
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

  // Phase 2 §1 — 죽은 legacy registry(lib/hermes/mcpServer.ts의 createLegacyOliviaHermesMcpServer,
  // lib/hermes/mcp/register*Tools.ts)는 실제 endpoint에서 호출되지 않는다. "tool 코드가 있다"를
  // "Hermes에 연결됐다"로 착각하지 않도록, 이번 Phase에서 추가한 7개 tool이 진짜 살아있는 경로
  // (listHermesOliviaTools() — app/api/hermes/mcp/route.ts가 실제로 쓰는 바로 그 함수)에
  // 노출되는지 직접 확인한다.
  it("Phase 2에서 추가한 업무일지/Finder/NAS 신규 tool 7종이 실제 Hermes MCP tool 목록에 노출된다", () => {
    const exposedNames = new Set(listHermesOliviaTools().map((tool) => tool.name));
    for (const name of [
      "work_journal_list", "work_journal_get", "work_journal_create", "work_journal_update", "work_journal_complete", "work_journal_search",
      "remote_folder_list", "remote_folder_get_info", "remote_file_search",
      "nas_backup_status", "nas_backup_recent", "nas_backup_get", "nas_backup_start_sort",
      "find_photo_folder", "start_photo_source_prep", "start_photo_scene_sort",
      "start_photo_raw_match", "start_photo_resize", "start_photo_ai_select", "start_photo_retouch",
    ]) {
      expect(exposedNames.has(name)).toBe(true);
    }
  });

  it("nas_backup_start_sort는 approval이 아니라 open이지만(비파괴적 job enqueue), department/shootingMode를 요구하는 schema다", () => {
    expect(getHermesToolPolicy("nas_backup_start_sort")).toBe("open");
    const tool = listHermesOliviaTools().find((t) => t.name === "nas_backup_start_sort")!;
    const properties = tool.inputSchema.properties as Record<string, unknown>;
    expect(properties).toHaveProperty("department");
    expect(properties).toHaveProperty("shootingMode");
    expect(properties).toHaveProperty("confirmRestart");
  });

  it("사진 채팅 실행 도구에서 폴더 검색은 read, 시작 도구는 mutation이다", () => {
    const tools = listHermesOliviaTools();
    const find = tools.find((tool) => tool.name === "find_photo_folder")!;
    expect(getHermesToolMode(find.name, find.description ?? "")).toBe("read");
    for (const name of ["start_photo_source_prep", "start_photo_scene_sort", "start_photo_raw_match", "start_photo_resize", "start_photo_ai_select", "start_photo_retouch"]) {
      const tool = tools.find((entry) => entry.name === name)!;
      expect(getHermesToolPolicy(name)).toBe("open");
      expect(getHermesToolMode(name, tool.description ?? "")).toBe("mutation");
    }
  });

  it("사진 도구 description이 실제 사용 표현을 모두 포함한다", () => {
    const tools = listHermesOliviaTools();
    const description = (name: string) => tools.find((tool) => tool.name === name)?.description ?? "";

    expect(description("find_photo_folder")).toMatch(/NAS 폴더/);
    expect(description("find_photo_folder")).toMatch(/백업 폴더/);
    expect(description("find_photo_folder")).toMatch(/촬영 폴더/);
    expect(description("find_photo_folder")).toMatch(/Workstation/);

    expect(description("start_photo_source_prep")).toMatch(/원본 분리/);
    expect(description("start_photo_source_prep")).toMatch(/RAW\/JPG 분리/);
    expect(description("start_photo_source_prep")).toMatch(/1차 분류/);
    expect(description("start_photo_source_prep")).toMatch(/JPG 통합/);

    expect(description("start_photo_scene_sort")).toMatch(/씬별 분류/);
    expect(description("start_photo_scene_sort")).toMatch(/사진 분류/);
    expect(description("start_photo_scene_sort")).toMatch(/2차 분류/);
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

  // Hermes MCP client는 ListTools를 연결 단위로 캐시한다. request별로 목록을 좁히면 먼저
  // 캐시한 turn의 도구가 계속 남아 다른 도메인의 도구가 사라진다. 따라서 request context와
  // 무관하게 항상 동일한 전체 catalog를 반환해야 한다.
  describe("listHermesOliviaTools — 안정적인 전체 catalog", () => {
    afterEach(() => {
      clearHermesExecutionContext("req-narrow-1");
      vi.restoreAllMocks();
    });

    it("requestId가 없어도 전체 목록을 반환한다", () => {
      const names = listHermesOliviaTools().map((t) => t.name).sort();
      const full = OLIVIA_V2_TOOLS.map((tool) => tool.name).filter((name) => getHermesToolPolicy(name) !== "blocked").sort();
      expect(names).toEqual(full);
    });

    it("등록된 request context가 있어도 목록을 좁히지 않는다", () => {
      registerHermesExecutionContext("req-narrow-1", { recentActions: [], revision: 0 });
      const names = listHermesOliviaTools("req-narrow-1").map((t) => t.name);
      const full = OLIVIA_V2_TOOLS.map((tool) => tool.name).filter((name) => getHermesToolPolicy(name) !== "blocked").sort();
      expect(names.sort()).toEqual(full);
    });

    it("전체 catalog의 존재하지 않는 Tool만 안전하게 거부한다", async () => {
      registerHermesExecutionContext("req-narrow-1", { recentActions: [], revision: 0 });
      const response = await executeHermesOliviaTool({ toolName: "no_such_tool_at_all", input: {}, requestId: "req-narrow-1" });
      expect(JSON.parse(response.content[0].text as string).code).toBe("TOOL_NOT_AVAILABLE");
    });
  });
});
