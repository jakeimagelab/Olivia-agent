import type { OliviaContextSnapshot, OliviaToolResult } from "@/lib/olivia/v2/types";
import { text } from "./common";
import { callOliviaApi } from "./http";
import { createVerification } from "./verification";

export const WORK_TOOL_NAMES = ["work_list_today", "work_create", "work_complete"] as const;

export async function executeWorkTool(
  name: string,
  input: Record<string, unknown>,
  context: OliviaContextSnapshot,
): Promise<OliviaToolResult> {
  void context;
  if (name === "work_list_today") {
    const date = text(input, "date");
    const payload = await callOliviaApi<{ ok: boolean; tasks: Array<Record<string, unknown>> }>(`/api/work-journal/tasks?date=${encodeURIComponent(date)}`);
    return { tool: name, success: true, data: { date, tasks: payload.tasks }, verification: createVerification({ executed: true }) };
  }

  if (name === "work_create") {
    const dueDate = text(input, "date");
    const title = text(input, "title");
    const created = await callOliviaApi<{ ok: boolean; task: Record<string, unknown> }>("/api/work-journal/tasks", {
      method: "POST",
      body: JSON.stringify({ dueDate, dueTime: text(input, "time") || null, title, assigneeName: text(input, "assigneeName") || null, priority: text(input, "priority") || "normal" }),
    });
    const taskId = String(created.task.id || "");
    if (!taskId) throw new Error("업무가 저장됐는지 확인하지 못했어요.");
    const readBack = await callOliviaApi<{ ok: boolean; task: Record<string, unknown> }>(`/api/work-journal/tasks/${taskId}`);
    if (readBack.task.title !== title || readBack.task.dueDate !== dueDate) throw new Error("업무 저장 검증 값이 요청과 일치하지 않아요.");
    return {
      tool: name,
      success: true,
      data: { taskId, resourceId: taskId, task: readBack.task, summary: `“${title}” 오늘 업무를 만들었어요.` },
      verification: createVerification({ executed: true, persisted: true, resourceExists: true, details: { title, dueDate } }),
    };
  }

  if (name === "work_complete") {
    const taskId = text(input, "taskId");
    if (!taskId) throw new Error("완료할 업무 ID가 필요해요.");
    await callOliviaApi<{ ok: boolean }>(`/api/work-journal/tasks/${taskId}`, { method: "PATCH", body: JSON.stringify({ status: "done" }) });
    const readBack = await callOliviaApi<{ ok: boolean; task: Record<string, unknown> }>(`/api/work-journal/tasks/${taskId}`);
    if (readBack.task.status !== "done") throw new Error("업무 완료 상태가 실제로 저장되지 않았어요.");
    return {
      tool: name,
      success: true,
      data: { taskId, resourceId: taskId, task: readBack.task, summary: "오늘 업무를 완료 처리했어요." },
      verification: createVerification({ executed: true, persisted: true, resourceExists: true, details: { status: "done" } }),
    };
  }

  throw new Error("지원하지 않는 Olivia 작업이에요.");
}
