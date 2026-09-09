import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { authorizeHermesToolRequest } from "@/lib/hermes/auth";
import { createOliviaHermesMcpServer } from "@/lib/hermes/mcpServer";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function handle(request: Request) {
  const authorization = authorizeHermesToolRequest(request);
  if (authorization === "missing_config") {
    return Response.json({ error: "Hermes Tool 인증 설정을 확인해주세요." }, { status: 503 });
  }
  if (authorization === "unauthorized") {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const server = createOliviaHermesMcpServer();
  const transport = new WebStandardStreamableHTTPServerTransport();
  await server.connect(transport);
  return transport.handleRequest(request);
}

export const POST = handle;
export const GET = handle;
export const DELETE = handle;
