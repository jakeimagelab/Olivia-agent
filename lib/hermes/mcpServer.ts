import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod/v4";
import { searchOliviaClients } from "@/lib/olivia/clientSearch";
import { recordHermesClientSearch, recordHermesToolCall } from "@/lib/hermes/toolAudit";
import { executeQuoteTool } from "@/lib/olivia/v2/toolExecutors/quote";
import type { OliviaContextSnapshot } from "@/lib/olivia/v2/types";

function quoteContext(quoteId?: string): OliviaContextSnapshot {
  return { activeWorkspace: "quote", activeResourceId: quoteId, recentActions: [], revision: 0 };
}

// Quote tool 6종이 전부 이 wrapper를 거친다 — executeQuoteTool(lib/olivia/v2/toolExecutors/quote.ts)의
// "실행→저장→재조회→검증" 로직은 그대로 재사용하고, 여기서는 MCP 응답 모양으로 감싸고
// toolAudit에 기록하는 것만 한다(실패는 throw든 {success:false} 리턴이든 둘 다 실패로 감사).
async function runQuoteTool(
  toolName: string,
  input: Record<string, unknown>,
  requestId: string | undefined,
  quoteId?: string,
) {
  try {
    const result = await executeQuoteTool(toolName, input, quoteContext(quoteId));
    if (!result.success) {
      recordHermesToolCall(requestId, toolName, { success: false, error: result.error || "요청을 처리하지 못했어요." });
      return {
        isError: true,
        content: [{ type: "text" as const, text: JSON.stringify({ success: false, error: result.error }) }],
      };
    }
    recordHermesToolCall(requestId, toolName, { success: true, data: result.data });
    return {
      content: [{ type: "text" as const, text: JSON.stringify(result) }],
      structuredContent: (result.data ?? {}) as Record<string, unknown>,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "요청을 처리하지 못했어요.";
    recordHermesToolCall(requestId, toolName, { success: false, error: message });
    return {
      isError: true,
      content: [{ type: "text" as const, text: JSON.stringify({ success: false, error: message }) }],
    };
  }
}

export function createOliviaHermesMcpServer() {
  const server = new McpServer({ name: "olivia", version: "0.1.0" });

  server.registerTool(
    "client.search",
    {
      title: "Olivia 고객 검색",
      description: "Search Olivia's registered clients by hospital or client name. Use whenever the user asks to find, identify, or look up a registered Olivia client. Never guess whether a client exists.",
      inputSchema: {
        query: z.string().trim().min(1).max(120).describe("Hospital or client name to search"),
        requestId: z.string().uuid().optional().describe("Opaque Olivia request correlation id supplied in the system instruction"),
      },
    },
    async ({ query, requestId }) => {
      try {
        const result = await searchOliviaClients(query);
        recordHermesClientSearch(requestId, { success: true, result });
        return {
          content: [{ type: "text" as const, text: JSON.stringify(result) }],
          structuredContent: result as unknown as Record<string, unknown>,
        };
      } catch {
        recordHermesClientSearch(requestId, { success: false, error: "고객 검색에 실패했습니다." });
        return {
          isError: true,
          content: [{ type: "text" as const, text: JSON.stringify({ success: false, error: "고객 검색에 실패했습니다." }) }],
        };
      }
    },
  );

  return server;
}
