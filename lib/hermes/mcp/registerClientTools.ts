import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod/v4";
import { runOliviaMcpTool } from "./runTool";

const requestId = z.string().uuid().optional();

export function registerClientTools(server: McpServer) {
  server.registerTool("client.get", { title: "Olivia 고객 상세 조회", description: "Read one registered Olivia client by the exact clientId returned by client.search. Never guess an id.", inputSchema: { clientId: z.string().uuid(), requestId } }, async ({ clientId, requestId }) => runOliviaMcpTool("client.get", "client_get", { clientId }, requestId));
  server.registerTool("client.create", {
    title: "Olivia 고객 생성",
    description: "Create a client through Olivia's existing client/workflow creation flow, then read it back. Use only when the user asked to register a new client and client.search confirmed there is no ambiguous existing client.",
    inputSchema: { hospitalName: z.string().trim().min(1).max(120), contactName: z.string().max(120).optional(), phone: z.string().max(40).optional(), email: z.string().email().optional(), specialty: z.string().max(120).optional(), memo: z.string().max(2000).optional(), requestId },
  }, async ({ requestId, ...input }) => runOliviaMcpTool("client.create", "client_create", input, requestId, {}, "mutation"));
  server.registerTool("client.update", {
    title: "Olivia 고객 수정",
    description: "Update a confirmed Olivia client through the existing client API and verify the stored values by reading the client back.",
    inputSchema: { clientId: z.string().uuid(), hospitalName: z.string().max(120).optional(), contactName: z.string().max(120).optional(), phone: z.string().max(40).optional(), email: z.string().email().optional(), specialty: z.string().max(120).optional(), memo: z.string().max(2000).optional(), requestId },
  }, async ({ requestId, ...input }) => runOliviaMcpTool("client.update", "client_update", input, requestId, {}, "mutation"));
}
