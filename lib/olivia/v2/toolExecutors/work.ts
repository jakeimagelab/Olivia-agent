import type { OliviaContextSnapshot, OliviaToolResult } from "@/lib/olivia/v2/types";
import { text } from "./common";
import { callOliviaApi } from "./http";
import { createVerification } from "./verification";

// work_journal_create/complete는 work_create/work_complete와 완전히 같은 동작이다(스펙이 요구한
// 이름, 기존 이름 둘 다 유지 — 이미 쓰고 있을 수 있는 호출부를 깨지 않는다). work_journal_list/
// get/update/search는 신규다 — 전부 /api/work-journal/tasks(같은 work_journal_tasks 테이블)를
// 그대로 쓴다. 별도 "오늘업무 DB"를 새로 만들지 않는다(Phase 2 §3, §24).
export const WORK_TOOL_NAMES = [
  "work_list_today", "work_create", "work_complete",
  "work_journal_list", "work_journal_get", "work_journal_create", "work_journal_update",
  "work_journal_complete", "work_journal_search",
] as const;

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

  if (name === "work_journal_list") {
    const date = text(input, "date");
    const from = text(input, "from");
    const to = text(input, "to");
    const params = new URLSearchParams();
    if (from && to) { params.set("from", from); params.set("to", to); }
    else if (date) { params.set("date", date); }
    else throw new Error("조회할 날짜(date) 또는 기간(from/to)이 필요해요.");
    const payload = await callOliviaApi<{ ok: boolean; tasks: Array<Record<string, unknown>> }>(`/api/work-journal/tasks?${params.toString()}`);
    return { tool: name, success: true, data: { date: date || undefined, from: from || undefined, to: to || undefined, tasks: payload.tasks }, verification: createVerification({ executed: true }) };
  }

  if (name === "work_journal_search") {
    const query = text(input, "query");
    if (!query) throw new Error("검색어가 필요해요.");
    const params = new URLSearchParams({ q: query });
    const date = text(input, "date");
    if (date) params.set("date", date);
    const payload = await callOliviaApi<{ ok: boolean; tasks: Array<Record<string, unknown>> }>(`/api/work-journal/tasks?${params.toString()}`);
    return { tool: name, success: true, data: { query, tasks: payload.tasks }, verification: createVerification({ executed: true }) };
  }

  if (name === "work_journal_get") {
    const taskId = text(input, "taskId");
    if (!taskId) throw new Error("조회할 업무 ID가 필요해요.");
    const payload = await callOliviaApi<{ ok: boolean; task: Record<string, unknown> }>(`/api/work-journal/tasks/${taskId}`);
    return { tool: name, success: true, data: { taskId, resourceId: taskId, task: payload.task }, verification: createVerification({ executed: true }) };
  }

  if (name === "work_create" || name === "work_journal_create") {
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

  if (name === "work_journal_update") {
    const taskId = text(input, "taskId");
    if (!taskId) throw new Error("수정할 업무 ID가 필요해요.");
    const patch: Record<string, unknown> = {};
    for (const key of ["dueDate", "dueTime", "title", "assigneeName", "status", "priority", "memo"] as const) {
      const value = text(input, key);
      if (value) patch[key] = value;
    }
    if (Object.keys(patch).length === 0) throw new Error("변경할 내용이 없어요.");
    await callOliviaApi<{ ok: boolean }>(`/api/work-journal/tasks/${taskId}`, { method: "PATCH", body: JSON.stringify(patch) });
    const readBack = await callOliviaApi<{ ok: boolean; task: Record<string, unknown> }>(`/api/work-journal/tasks/${taskId}`);
    for (const [key, value] of Object.entries(patch)) {
      if (readBack.task[key] !== value) throw new Error("업무 수정 값이 실제로 저장되지 않았어요.");
    }
    return {
      tool: name,
      success: true,
      data: { taskId, resourceId: taskId, task: readBack.task, summary: "업무를 수정했어요." },
      verification: createVerification({ executed: true, persisted: true, resourceExists: true, details: patch }),
    };
  }

  if (name === "work_complete" || name === "work_journal_complete") {
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
