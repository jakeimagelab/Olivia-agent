import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { attachOliviaToolBridge } from "@/lib/hermes/mcp/oliviaToolBridge";

export function createOliviaHermesMcpServer() {
  const server = new Server(
    { name: "olivia", version: "0.2.0" },
    { capabilities: { tools: { listChanged: false } } },
  );
  attachOliviaToolBridge(server);
  return server;
}
