import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod/v4";
import { runOliviaMcpTool } from "./runTool";

const requestId = z.string().uuid().optional();

export function registerQuoteTools(server: McpServer) {
  server.registerTool("get_quote", { title: "견적서 조회", description: "Read the canonical quote by quoteId. Reuse the quoteId already active in this conversation instead of creating another quote.", inputSchema: { quoteId: z.string().uuid(), requestId } }, async ({ quoteId, requestId }) => runOliviaMcpTool("get_quote", "get_quote", { quoteId }, requestId, { activeWorkspace: "quote", activeResourceId: quoteId }));
  server.registerTool("preview_quote", { title: "견적서 미리보기", description: "Return canonical quote preview linkage for Desktop/Mobile without copying the quote data.", inputSchema: { quoteId: z.string().uuid(), requestId } }, async ({ quoteId, requestId }) => runOliviaMcpTool("preview_quote", "preview_quote", {}, requestId, { activeWorkspace: "quote", activeResourceId: quoteId }));
  server.registerTool("request_quote_publish", { title: "견적서 발행 승인 요청", description: "Read the current quote and return the exact approval summary. This does not publish. Call publish_quote only after explicit user approval.", inputSchema: { quoteId: z.string().uuid(), requestId } }, async ({ quoteId, requestId }) => runOliviaMcpTool("request_quote_publish", "request_quote_publish", {}, requestId, { activeWorkspace: "quote", activeResourceId: quoteId }, "approval"));
}
