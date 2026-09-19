import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { AjvJsonSchemaValidator } from "@modelcontextprotocol/sdk/validation/ajv";
import { OLIVIA_V2_TOOLS, executeAgentTool } from "@/lib/olivia/v2/toolExecutor";
import type { OliviaContextSnapshot } from "@/lib/olivia/v2/types";
import { assertToolResultVerified } from "@/lib/olivia/v2/toolExecutors/verification";
import { normalizeToolError } from "@/lib/olivia/v2/toolError";
import { getHermesExecutionContext } from "@/lib/hermes/executionContext";
import { recordHermesToolCall } from "@/lib/hermes/toolAudit";
import { getHermesToolMode, getHermesToolPolicy } from "./exposurePolicy";

type JsonSchema = Record<string, unknown>;
const validator = new AjvJsonSchemaValidator();

function schemaWithRequestId(parameters: unknown): JsonSchema {
  const schema = parameters && typeof parameters === "object" && !Array.isArray(parameters) ? parameters as JsonSchema : { type: "object" };
  const properties = schema.properties && typeof schema.properties === "object" && !Array.isArray(schema.properties) ? schema.properties as Record<string, unknown> : {};
  return { ...schema, properties: { ...properties, requestId: { type: "string", format: "uuid", description: "Optional Olivia request correlation id" } } };
}

// 코드 요청서(2026-09-18) 작업 C — 매 turn 69개 전체 도구를 Hermes에 보내는 대신, route.ts가
// legacy 경로와 똑같이 selectOliviaTools()로 이미 골라둔 이름 집합(requestId로 조회)이 있으면
// 그것만 내려준다. requestId가 없거나(로컬 도구 테스트 등) 그 turn에 선택된 이름이 비어있으면
// (예: 컨텍스트가 아직 등록 안 됐거나 legacy 경로처럼 이 값 자체를 안 쓰는 호출) 절대 도구를
// 숨기지 않고 기존처럼 전체 목록을 돌려준다 — "누락으로 실패"하느니 프롬프트가 조금 커지는
// 쪽이 낫다. CallTool(executeHermesOliviaTool)은 이 좁힌 목록과 무관하게 항상 실행한다.
export function listHermesOliviaTools(requestId?: string) {
  const allowed = OLIVIA_V2_TOOLS.filter((tool) => getHermesToolPolicy(tool.name) !== "blocked");
  const selectedToolNames = getHermesExecutionContext(requestId)?.selectedToolNames;
  const narrowed = selectedToolNames?.length ? allowed.filter((tool) => selectedToolNames.includes(tool.name)) : allowed;
  return narrowed.map((tool) => ({
    name: tool.name,
    description: tool.description,
    inputSchema: schemaWithRequestId(tool.parameters),
    annotations: getHermesToolPolicy(tool.name) === "approval" ? { destructiveHint: true, openWorldHint: false } : { openWorldHint: false },
  }));
}

function inferResource(data: Record<string, unknown> | undefined, toolName: string) {
  const resourceId = data && [data.resourceId, data.quoteId, data.contractId, data.contiId, data.memoId, data.taskId, data.clientId].find((value): value is string => typeof value === "string" && Boolean(value));
  const resourceType = typeof data?.resourceType === "string" ? data.resourceType : toolName.includes("quote") ? "quote" : toolName.includes("contract") ? "contract" : toolName.includes("conti") ? "conti" : toolName.includes("memo") ? "memo" : toolName.includes("calendar") ? "calendar" : toolName.includes("work") ? "work" : toolName.includes("client") ? "client" : undefined;
  return { resourceType, resourceId };
}

export async function executeHermesOliviaTool(options: { toolName: string; input?: Record<string, unknown>; requestId?: string; fallbackContext?: OliviaContextSnapshot }) {
  const definition = OLIVIA_V2_TOOLS.find((tool) => tool.name === options.toolName);
  if (!definition || getHermesToolPolicy(options.toolName) === "blocked") {
    return { isError: true as const, content: [{ type: "text" as const, text: JSON.stringify({ success: false, code: "TOOL_NOT_AVAILABLE", error: "이 Olivia 작업은 현재 MCP에서 실행할 수 없습니다." }) }] };
  }
  const input = { ...(options.input ?? {}) };
  const requestId = options.requestId || (typeof input.requestId === "string" ? input.requestId : undefined);
  delete input.requestId;
  // 좁힌 목록 밖의 도구를 Hermes가 불러도 막지 않는다(요청서 §21 관찰가능성과 같은 원칙 —
  // 차단이 가끔의 큰 프롬프트보다 더 나쁘다). 왜 좁혀지지 않은 도구가 호출됐는지 로그로만
  // 남겨서, listHermesOliviaTools()의 좁히기 기준이 실제로 부족한지 나중에 판단할 수 있게 한다.
  const selectedToolNames = getHermesExecutionContext(requestId)?.selectedToolNames;
  if (selectedToolNames?.length && !selectedToolNames.includes(options.toolName)) {
    console.info("[HermesTool] called outside narrowed selection", { requestId, toolName: options.toolName });
  }
  const mode = getHermesToolMode(definition.name, definition.description ?? "");
  const checked = validator.getValidator(definition.parameters as JsonSchema)(input);
  if (!checked.valid) {
    const error = checked.errorMessage || "Tool 입력값이 schema와 일치하지 않습니다.";
    recordHermesToolCall(requestId, definition.name, { success: false, mode, error, code: "INVALID_TOOL_INPUT" });
    return { isError: true as const, content: [{ type: "text" as const, text: JSON.stringify({ success: false, code: "INVALID_TOOL_INPUT", error }) }] };
  }
  const context = getHermesExecutionContext(requestId)?.context ?? options.fallbackContext ?? { recentActions: [], revision: 0 };
  if (mode === "mutation" && context.canEdit === false) {
    const error = "현재 Olivia Context에는 수정 권한이 없습니다.";
    recordHermesToolCall(requestId, definition.name, { success: false, mode, error, code: "PERMISSION_DENIED" });
    return { isError: true as const, content: [{ type: "text" as const, text: JSON.stringify({ success: false, code: "PERMISSION_DENIED", error }) }] };
  }
  try {
    const { result, uiActions } = await executeAgentTool({ id: crypto.randomUUID(), name: definition.name, arguments: JSON.stringify(input) }, context);
    const resource = inferResource(result.data, definition.name);
    const changedEntityId = typeof result.data?.changedEntityId === "string" ? result.data.changedEntityId : undefined;
    if (!result.success) {
      const failure = { success: false as const, error: result.error || "요청을 처리하지 못했어요.", code: result.code || "TOOL_EXECUTION_FAILED", details: result.details, data: result.data, verification: result.verification, uiActions };
      recordHermesToolCall(requestId, definition.name, { ...failure, mode, uiToolName: definition.name, ...resource, changedEntityId });
      return { isError: true as const, content: [{ type: "text" as const, text: JSON.stringify(failure) }] };
    }
    assertToolResultVerified(result, mode);
    const data = resource.resourceType || resource.resourceId ? { ...(result.data ?? {}), ...resource } : result.data;
    const success = { success: true as const, data, verification: result.verification, uiActions };
    recordHermesToolCall(requestId, definition.name, { ...success, mode, uiToolName: definition.name, ...resource, changedEntityId });
    return { content: [{ type: "text" as const, text: JSON.stringify(success) }], structuredContent: success as unknown as Record<string, unknown> };
  } catch (error) {
    const failure = { success: false as const, ...normalizeToolError(error) };
    const resource = inferResource(input, definition.name);
    recordHermesToolCall(requestId, definition.name, { ...failure, mode, uiToolName: definition.name, ...resource });
    return { isError: true as const, content: [{ type: "text" as const, text: JSON.stringify(failure) }] };
  }
}

export function attachOliviaToolBridge(server: Server) {
  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: listHermesOliviaTools() }));
  server.setRequestHandler(CallToolRequestSchema, async (request, extra) => {
    const header = extra.requestInfo?.headers?.["x-olivia-request-id"];
    return executeHermesOliviaTool({
      toolName: request.params.name,
      input: request.params.arguments,
      requestId: Array.isArray(header) ? header[0] : header,
    });
  });
}
