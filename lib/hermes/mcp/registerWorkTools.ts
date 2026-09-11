import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod/v4";
import { runOliviaMcpTool } from "./runTool";

const requestId = z.string().uuid().optional();
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export function registerWorkTools(server: McpServer) {
  server.registerTool("work.list_today", { title: "오늘 업무 조회", description: "List Olivia Today Work items for a resolved YYYY-MM-DD date. Use for tasks such as quote edits, file delivery, conti review, preparation, and follow-up — not timed meetings or shoots.", inputSchema: { date, requestId } }, async ({ date, requestId }) => runOliviaMcpTool("work.list_today", "work_list_today", { date }, requestId));
  server.registerTool("work.create", { title: "오늘 업무 생성", description: "Create a non-schedule Today Work item in Olivia and verify it by reading it back. Use calendar.add instead for a timed appointment, shoot, meeting, or visit.", inputSchema: { date, title: z.string().trim().min(1).max(200), time: z.string().regex(/^\d{2}:\d{2}$/).optional(), assigneeName: z.string().max(120).optional(), priority: z.enum(["low", "normal", "high"]).optional(), requestId } }, async ({ requestId, ...input }) => runOliviaMcpTool("work.create", "work_create", input, requestId, {}, "mutation"));
  server.registerTool("work.complete", { title: "오늘 업무 완료", description: "Mark an exact Olivia Today Work item done and verify its persisted status.", inputSchema: { taskId: z.string().uuid(), requestId } }, async ({ taskId, requestId }) => runOliviaMcpTool("work.complete", "work_complete", { taskId }, requestId, {}, "mutation"));
}
