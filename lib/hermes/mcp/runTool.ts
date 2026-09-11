import { recordHermesToolCall } from "@/lib/hermes/toolAudit";
import { runTool } from "@/lib/olivia/v2/toolExecutor";
import type { OliviaContextSnapshot, OliviaToolResult } from "@/lib/olivia/v2/types";
import { normalizeToolError } from "@/lib/olivia/v2/toolError";
import { assertToolResultVerified, type ToolExecutionMode } from "@/lib/olivia/v2/toolExecutors/verification";

export type McpToolContext = Partial<OliviaContextSnapshot>;

function inferResource(data: Record<string, unknown> | undefined, toolName: string) {
  const resourceId = data && [data.resourceId, data.quoteId, data.contractId, data.contiId, data.memoId, data.taskId, data.clientId]
    .find((value): value is string => typeof value === "string" && Boolean(value));
  const resourceType = typeof data?.resourceType === "string"
    ? data.resourceType
    : toolName.includes("quote") ? "quote"
      : toolName.includes("contract") ? "contract"
        : toolName.includes("conti") ? "conti"
          : toolName.includes("memo") ? "memo"
            : toolName.includes("calendar") ? "calendar"
              : toolName.includes("work") ? "work"
                : toolName.includes("client") ? "client" : undefined;
  return { resourceType, resourceId };
}

export async function runOliviaMcpExecution(options: {
  exposedToolName: string;
  mode: ToolExecutionMode;
  requestId?: string;
  input: Record<string, unknown>;
  execute: () => Promise<OliviaToolResult>;
  uiToolName?: string;
}) {
  const { exposedToolName, mode, requestId, input } = options;
  try {
    const result = await options.execute();
    const resource = inferResource(result.data, exposedToolName);
    const changedEntityId = typeof result.data?.changedEntityId === "string" ? result.data.changedEntityId : undefined;
    if (!result.success) {
      const failure = {
        success: false as const,
        error: result.error || "요청을 처리하지 못했어요.",
        code: result.code || "TOOL_EXECUTION_FAILED",
        ...(result.details ? { details: result.details } : {}),
        ...(result.data ? { data: result.data } : {}),
        ...(result.verification ? { verification: result.verification } : {}),
      };
      recordHermesToolCall(requestId, exposedToolName, { ...failure, mode, uiToolName: options.uiToolName, ...resource, changedEntityId });
      return { isError: true, content: [{ type: "text" as const, text: JSON.stringify(failure) }] };
    }
    assertToolResultVerified(result, mode);
    const data = resource.resourceType || resource.resourceId
      ? { ...(result.data ?? {}), ...resource }
      : result.data;
    recordHermesToolCall(requestId, exposedToolName, { success: true, mode, uiToolName: options.uiToolName, data, ...resource, changedEntityId, verification: result.verification });
    return {
      content: [{ type: "text" as const, text: JSON.stringify({ success: true, data, verification: result.verification }) }],
      structuredContent: (data ?? {}) as Record<string, unknown>,
    };
  } catch (error) {
    const failure = { success: false as const, ...normalizeToolError(error) };
    const resource = inferResource(input, exposedToolName);
    recordHermesToolCall(requestId, exposedToolName, { ...failure, mode, uiToolName: options.uiToolName, ...resource });
    return { isError: true, content: [{ type: "text" as const, text: JSON.stringify(failure) }] };
  }
}

export async function runOliviaMcpTool(
  exposedToolName: string,
  executorToolName: string,
  input: Record<string, unknown>,
  requestId: string | undefined,
  context: McpToolContext = {},
  mode: ToolExecutionMode = "read",
) {
  const executionContext: OliviaContextSnapshot = { recentActions: [], revision: 0, ...context };
  return runOliviaMcpExecution({
    exposedToolName,
    mode,
    requestId,
    input,
    execute: () => runTool(executorToolName, input, executionContext),
    uiToolName: executorToolName,
  });
}
