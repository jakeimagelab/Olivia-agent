import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod/v4";
import { runOliviaMcpTool } from "./runTool";

const requestId = z.string().uuid().optional();

export function registerUiTools(server: McpServer) {
  server.registerTool("ui.open_feature", {
    title: "Olivia 화면 열기",
    description: "Resolve and open an Olivia Desktop feature such as clients, calendar, quotes, contracts, or conti. Use only on the web/Desktop channel. This emits an Olivia UI action and never manipulates browser DOM directly.",
    inputSchema: {
      featureQuery: z.string().trim().min(1).max(120),
      hospitalName: z.string().trim().max(120).optional(),
      requestId,
    },
  }, async ({ requestId, ...input }) => runOliviaMcpTool("ui.open_feature", "open_feature", input, requestId, {}, "ui"));
}
