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

  server.registerTool(
    "create_quote",
    {
      title: "견적서 생성",
      description: "Create a new Olivia quote (견적서) for a hospital/client. Always call this before adding or editing items. Returns quoteId — remember it in this conversation and pass it as quoteId to every subsequent quote tool call.",
      inputSchema: {
        hospitalName: z.string().trim().min(1).max(120).describe("Hospital or client name the quote is for"),
        contactName: z.string().trim().max(60).optional(),
        phone: z.string().trim().max(40).optional(),
        email: z.string().trim().max(120).optional(),
        brand: z.enum(["photoclinic", "jakeimage"]).optional().describe("Document brand, defaults to photoclinic"),
        requestId: z.string().uuid().optional().describe("Opaque Olivia request correlation id supplied in the system instruction"),
      },
    },
    async ({ requestId, ...input }) => runQuoteTool("create_quote", input, requestId),
  );

  server.registerTool(
    "add_quote_item",
    {
      title: "견적 항목 추가",
      description: "Add a new line item to an existing quote. Requires the quoteId returned by create_quote. Never invent a unitPrice — ask the user if it wasn't given.",
      inputSchema: {
        quoteId: z.string().uuid().describe("Quote id returned by create_quote"),
        name: z.string().trim().min(1).max(120),
        unitPrice: z.union([z.string(), z.number()]).describe("Unit price in KRW, e.g. 500000"),
        quantity: z.union([z.string(), z.number()]).optional(),
        description: z.string().trim().max(200).optional(),
        note: z.string().trim().max(200).optional(),
        requestId: z.string().uuid().optional(),
      },
    },
    async ({ quoteId, requestId, ...input }) => runQuoteTool("add_quote_item", input, requestId, quoteId),
  );

  server.registerTool(
    "update_quote_item",
    {
      title: "견적 항목 수정",
      description: "Update an existing quote line item's price, quantity, description, or note. Requires quoteId and a selector (item name or partial text) to find the target row; use position if selector is ambiguous.",
      inputSchema: {
        quoteId: z.string().uuid(),
        selector: z.string().trim().max(120).optional().describe("Item name or partial text to find the target row"),
        position: z.union([z.string(), z.number()]).optional().describe("Ordinal position if selector is ambiguous, e.g. 1 or '첫번째'"),
        amount: z.union([z.string(), z.number()]).optional(),
        quantity: z.union([z.string(), z.number()]).optional(),
        description: z.string().trim().max(200).optional(),
        note: z.string().trim().max(200).optional(),
        requestId: z.string().uuid().optional(),
      },
    },
    async ({ quoteId, requestId, ...input }) => runQuoteTool("update_quote_item", input, requestId, quoteId),
  );

  server.registerTool(
    "remove_quote_item",
    {
      title: "견적 항목 삭제",
      description: "Remove a line item from a quote. Requires quoteId and a selector or position to find the target item.",
      inputSchema: {
        quoteId: z.string().uuid(),
        selector: z.string().trim().max(120).optional(),
        position: z.union([z.string(), z.number()]).optional(),
        requestId: z.string().uuid().optional(),
      },
    },
    async ({ quoteId, requestId, ...input }) => runQuoteTool("remove_quote_item", input, requestId, quoteId),
  );

  server.registerTool(
    "apply_quote_discount",
    {
      title: "견적 할인 적용",
      description: "Apply or remove a discount on a quote. Provide either amount (KRW), percent (of item subtotal), or remove:true to clear the discount.",
      inputSchema: {
        quoteId: z.string().uuid(),
        amount: z.union([z.string(), z.number()]).optional(),
        percent: z.union([z.string(), z.number()]).optional(),
        remove: z.boolean().optional(),
        requestId: z.string().uuid().optional(),
      },
    },
    async ({ quoteId, requestId, ...input }) => runQuoteTool("apply_quote_discount", input, requestId, quoteId),
  );

  server.registerTool(
    "publish_quote",
    {
      title: "견적서 확정 공개",
      description: "Finalize and publish a quote — links/creates the client if needed, opens the customer portal, and marks the quote ready for delivery. Only call this after the user has explicitly confirmed the quote is correct. This cannot be undone by calling it again with different data — create a new quote instead if the deal changes after publishing.",
      inputSchema: {
        quoteId: z.string().uuid(),
        requestId: z.string().uuid().optional(),
      },
    },
    async ({ quoteId, requestId }) => runQuoteTool("publish_quote", {}, requestId, quoteId),
  );

  return server;
}
