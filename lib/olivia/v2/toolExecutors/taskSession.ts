import { continueTaskSession, getTaskSessionStatus, pauseTaskSession, startTaskSession } from "@/lib/olivia/tools/taskSession";
import type { OliviaContextSnapshot, OliviaToolResult } from "@/lib/olivia/v2/types";
import { text, fromLegacyResult } from "./common";

export const TASK_SESSION_TOOL_NAMES = ["start_task_session", "get_task_session_status", "continue_task_session", "pause_task_session"] as const;

// Task Session(코드 요청서 2026-08-17) — Workflow 자체를 새로 안 만들고, 그중 사용자가 지금
// 실제로 처리 중인 구간만 "지금 하는 일" 묶음으로 보여준다. 완료 여부는 오직 기존
// workflow_runs.current_step_key로만 판단하므로(lib/olivia/taskSession/nextAction.ts) 이
// 도구들은 Workflow 상태를 직접 바꾸지 않는다 — 조회하고 workspace를 열어줄 뿐이다.
export async function executeTaskSessionTool(
  name: string,
  input: Record<string, unknown>,
  context: OliviaContextSnapshot,
): Promise<OliviaToolResult> {
  const clientName = text(input, "clientName") || context.activeClientName;

  if (name === "start_task_session") return fromLegacyResult(name, await startTaskSession({ ...input, clientName }));
  if (name === "get_task_session_status") return fromLegacyResult(name, await getTaskSessionStatus({ clientName }));
  if (name === "continue_task_session") return fromLegacyResult(name, await continueTaskSession({ clientName }));
  if (name === "pause_task_session") return fromLegacyResult(name, await pauseTaskSession({ clientName }));

  throw new Error("지원하지 않는 Olivia 작업이에요.");
}
