import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod/v4";
import { runOliviaMcpTool } from "./runTool";

const requestId = z.string().uuid().optional();

export function registerWorkflowTools(server: McpServer) {
  server.registerTool("workflow.get_snapshot", {
    title: "프로젝트 Core Snapshot 조회",
    description: "Read the canonical Olivia Core project snapshot for an exact workflow run. Never infer workflow/resource state from chat history when this tool is available.",
    inputSchema: { workflowRunId: z.string().uuid(), requestId },
  }, async ({ workflowRunId, requestId }) => runOliviaMcpTool(
    "workflow.get_snapshot",
    "get_project_snapshot",
    { workflowRunId },
    requestId,
    { activeProjectId: workflowRunId },
    "read",
  ));
  server.registerTool("workflow.list_active", {
    title: "진행 중인 업무 흐름 조회",
    description: "List active Olivia workflow runs. This is a safe read. Use the returned exact workflow/client identity; never choose an arbitrary most-recent workflow for a mutation.",
    inputSchema: { requestId },
  }, async ({ requestId }) => runOliviaMcpTool("workflow.list_active", "list_active_workflows", {}, requestId));
}
