import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod/v4";
import { searchOliviaClients } from "@/lib/olivia/clientSearch";
import { recordHermesClientSearch, recordHermesToolCall } from "@/lib/hermes/toolAudit";
import { executeQuoteTool } from "@/lib/olivia/v2/toolExecutors/quote";
import { executeCalendarTool } from "@/lib/olivia/v2/toolExecutors/calendar";
import type { OliviaContextSnapshot } from "@/lib/olivia/v2/types";
import { registerClientTools } from "@/lib/hermes/mcp/registerClientTools";
import { registerWorkTools } from "@/lib/hermes/mcp/registerWorkTools";
import { registerQuoteTools } from "@/lib/hermes/mcp/registerQuoteTools";
import { registerContractTools } from "@/lib/hermes/mcp/registerContractTools";
import { registerContiTools } from "@/lib/hermes/mcp/registerContiTools";
import { registerMemoTools } from "@/lib/hermes/mcp/registerMemoTools";
import { registerAnalysisTools } from "@/lib/hermes/mcp/registerAnalysisTools";
import { registerWorkflowTools } from "@/lib/hermes/mcp/registerWorkflowTools";
import { registerUiTools } from "@/lib/hermes/mcp/registerUiTools";
import { runOliviaMcpExecution } from "@/lib/hermes/mcp/runTool";
import { normalizeToolError } from "@/lib/olivia/v2/toolError";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { attachOliviaToolBridge } from "@/lib/hermes/mcp/oliviaToolBridge";

function quoteContext(quoteId?: string): OliviaContextSnapshot {
  return { activeWorkspace: "quote", activeResourceId: quoteId, recentActions: [], revision: 0 };
}

function calendarContext(): OliviaContextSnapshot {
  return { activeWorkspace: "calendar", recentActions: [], revision: 0 };
}

// calendar_* 6종도 quote와 동일한 wrapper 규약을 쓴다 — executeCalendarTool(기존 v2 웹챗이 쓰는
// 그 구현 그대로)을 감싸고, MCP 응답 모양+toolAudit 기록만 여기서 한다.
async function runCalendarTool(toolName: string, input: Record<string, unknown>, requestId: string | undefined) {
  const mode = ["calendar_add", "calendar_add_bulk", "calendar_update", "calendar_complete", "calendar_delete"].includes(toolName) ? "mutation" : "read";
  return runOliviaMcpExecution({
    exposedToolName: toolName,
    mode,
    requestId,
    input,
    execute: () => executeCalendarTool(toolName, input, calendarContext()),
  });
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
  const mode = ["create_quote", "add_quote_item", "update_quote_item", "remove_quote_item", "apply_quote_discount", "publish_quote"].includes(toolName) ? "mutation" : "read";
  return runOliviaMcpExecution({
    exposedToolName: toolName,
    mode,
    requestId,
    input: { ...input, ...(quoteId ? { quoteId } : {}) },
    execute: () => executeQuoteTool(toolName, input, quoteContext(quoteId)),
  });
}

function createLegacyOliviaHermesMcpServer() {
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
        recordHermesToolCall(requestId, "client.search", {
          success: true,
          mode: "read",
          data: result,
          resourceType: "client",
          resourceId: result.clients.length === 1 ? result.clients[0].id : undefined,
          verification: result.verification,
        });
        return {
          content: [{ type: "text" as const, text: JSON.stringify(result) }],
          structuredContent: result as unknown as Record<string, unknown>,
        };
      } catch (error) {
        const failure = normalizeToolError(error);
        recordHermesClientSearch(requestId, { success: false, error: failure.error });
        recordHermesToolCall(requestId, "client.search", { success: false, mode: "read", ...failure, resourceType: "client" });
        return {
          isError: true,
          content: [{ type: "text" as const, text: JSON.stringify({ success: false, ...failure }) }],
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

  const CATEGORY = z.enum(["shooting", "client", "admin", "personal", "general"]);

  server.registerTool(
    "calendar_list",
    {
      title: "일정 조회",
      description: "List all calendar tasks for a single date. Date must already be resolved to YYYY-MM-DD (see date resolution rules).",
      inputSchema: {
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe("YYYY-MM-DD"),
        requestId: z.string().uuid().optional(),
      },
    },
    async ({ date, requestId }) => runCalendarTool("calendar_list", { date }, requestId),
  );

  server.registerTool(
    "calendar_list_month",
    {
      title: "월간 일정 조회",
      description: "List all calendar tasks for a whole month.",
      inputSchema: {
        month: z.string().regex(/^\d{4}-\d{2}$/).describe("YYYY-MM"),
        requestId: z.string().uuid().optional(),
      },
    },
    async ({ month, requestId }) => runCalendarTool("calendar_list_month", { month }, requestId),
  );

  server.registerTool(
    "calendar_add",
    {
      title: "일정 추가",
      description: "Add a single calendar task. Date must already be resolved to YYYY-MM-DD per the date resolution rules — never pass relative words like '내일'.",
      inputSchema: {
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe("YYYY-MM-DD, already resolved"),
        title: z.string().trim().min(1).max(200),
        time: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/).optional().describe("HH:mm, 24h"),
        end_time: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/).optional(),
        location: z.string().trim().max(200).optional(),
        memo: z.string().trim().max(2000).optional(),
        category: CATEGORY.optional().describe("Omit if unclear — it will be guessed from the title"),
        requestId: z.string().uuid().optional(),
      },
    },
    async ({ requestId, ...input }) => runCalendarTool("calendar_add", input, requestId),
  );

  server.registerTool(
    "calendar_add_bulk",
    {
      title: "일정 여러 건 추가",
      description: "Add multiple calendar tasks in one call, e.g. when the user pastes several lines that are each a separate event (dates may differ per item).",
      inputSchema: {
        tasks: z.array(z.object({
          date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
          title: z.string().trim().min(1).max(200),
          time: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/).optional(),
          end_time: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/).optional(),
          location: z.string().trim().max(200).optional(),
          memo: z.string().trim().max(2000).optional(),
          category: CATEGORY.optional(),
        })).min(1).max(30),
        requestId: z.string().uuid().optional(),
      },
    },
    async ({ requestId, tasks }) => runCalendarTool("calendar_add_bulk", { tasks }, requestId),
  );

  server.registerTool(
    "calendar_update",
    {
      title: "일정 수정",
      description: "Update an existing calendar task. Provide id if known, otherwise date + matchTitle (partial title text) to locate it. If matchTitle matches more than one task, this call fails with the candidate list — ask the user which one before retrying.",
      inputSchema: {
        id: z.string().uuid().optional(),
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe("Required together with matchTitle when id is unknown"),
        matchTitle: z.string().trim().min(1).max(200).optional(),
        title: z.string().trim().max(200).optional(),
        time: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/).nullable().optional(),
        end_time: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/).nullable().optional(),
        location: z.string().trim().max(200).nullable().optional(),
        memo: z.string().trim().max(2000).optional(),
        category: CATEGORY.optional(),
        requestId: z.string().uuid().optional(),
      },
    },
    async ({ requestId, ...input }) => runCalendarTool("calendar_update", input, requestId),
  );

  server.registerTool(
    "calendar_complete",
    {
      title: "일정 완료 처리",
      description: "Mark a calendar task as completed. Provide id if known, otherwise date + matchTitle.",
      inputSchema: {
        id: z.string().uuid().optional(),
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        matchTitle: z.string().trim().min(1).max(200).optional(),
        requestId: z.string().uuid().optional(),
      },
    },
    async ({ requestId, ...input }) => runCalendarTool("calendar_complete", input, requestId),
  );

  server.registerTool(
    "calendar_delete",
    {
      title: "일정 삭제",
      description: "Delete a calendar task (moved to trash, recoverable). Provide id if known, otherwise date + matchTitle. Only call this after the user explicitly asked to delete/cancel that event.",
      inputSchema: {
        id: z.string().uuid().optional(),
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        matchTitle: z.string().trim().min(1).max(200).optional(),
        requestId: z.string().uuid().optional(),
      },
    },
    async ({ requestId, ...input }) => runCalendarTool("calendar_delete", input, requestId),
  );

  server.registerTool(
    "calendar_availability",
    {
      title: "일정 충돌 확인",
      description: "Check whether a given date+time already has a conflicting task within a 1-hour window. Use this before adding a timed event if the user seems unsure whether they're free.",
      inputSchema: {
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        time: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/),
        requestId: z.string().uuid().optional(),
      },
    },
    async ({ requestId, ...input }) => runCalendarTool("calendar_availability", input, requestId),
  );

  registerClientTools(server);
  registerWorkTools(server);
  registerQuoteTools(server);
  registerContractTools(server);
  registerContiTools(server);
  registerMemoTools(server);
  registerAnalysisTools(server);
  registerWorkflowTools(server);
  registerUiTools(server);

  return server;
}

// Olivia Tool Registry가 유일한 discovery/execution source다. 위 legacy builder는 롤백 비교를
// 위해 당분간만 남기며 실제 endpoint에서는 호출하지 않는다.
void createLegacyOliviaHermesMcpServer;

export function createOliviaHermesMcpServer() {
  const server = new Server(
    { name: "olivia", version: "0.2.0" },
    { capabilities: { tools: { listChanged: false } } },
  );
  attachOliviaToolBridge(server);
  return server;
}
