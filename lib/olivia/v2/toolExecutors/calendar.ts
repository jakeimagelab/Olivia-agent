import { getSupabaseAdmin } from "@/lib/supabase";
import {
  addCalendarTask,
  deleteCalendarTask,
  getCalendarTask,
  listCalendarTasks,
  resolveCalendarTaskId,
  updateCalendarTask,
} from "@/lib/olivia/tools/calendar";
import { findCalendarConflicts } from "@/lib/assistant/actions/calendarAvailability";
import type { OliviaContextSnapshot, OliviaToolResult } from "@/lib/olivia/v2/types";
import { text } from "./common";
import { createVerification } from "./verification";

export const CALENDAR_TOOL_NAMES = [
  "calendar_list", "calendar_add", "calendar_add_bulk", "calendar_update",
  "calendar_complete", "calendar_delete", "calendar_availability", "calendar_list_month",
] as const;

function verifyCalendarFields(task: Record<string, unknown>, requested: Record<string, unknown>) {
  for (const key of ["date", "title", "time", "end_time", "location", "memo", "category"] as const) {
    if (requested[key] !== undefined && (task[key] ?? null) !== (requested[key] ?? null)) {
      throw new Error(`일정 저장 검증 값이 요청과 일치하지 않아요: ${key}`);
    }
  }
}

export function calendarMonthRange(month: string) {
  if (!/^\d{4}-\d{2}$/.test(month)) throw new Error("월은 YYYY-MM 형식이어야 합니다.");
  const [year, monthNumber] = month.split("-").map(Number);
  if (monthNumber < 1 || monthNumber > 12) throw new Error("올바른 월을 입력해주세요.");
  const nextYear = monthNumber === 12 ? year + 1 : year;
  const nextMonth = monthNumber === 12 ? 1 : monthNumber + 1;
  return {
    start: `${year}-${String(monthNumber).padStart(2, "0")}-01`,
    endExclusive: `${nextYear}-${String(nextMonth).padStart(2, "0")}-01`,
  };
}

export async function executeCalendarTool(
  name: string,
  input: Record<string, unknown>,
  context: OliviaContextSnapshot,
): Promise<OliviaToolResult> {
  void context;
  const db = getSupabaseAdmin();

  if (name === "calendar_list") {
    const tasks = await listCalendarTasks(text(input, "date"));
    return { tool: name, success: true, data: { date: text(input, "date"), tasks } };
  }
  if (name === "calendar_add") {
    if (input.time) {
      const existing = await listCalendarTasks(text(input, "date"));
      const conflicts = findCalendarConflicts(existing, input.time as string, 60);
      if (conflicts.length > 0) {
        const labels = conflicts.slice(0, 3).map((task: any) => `${task.time} ${task.title}`).join(", ");
        throw new Error(`같은 시간대에 등록된 일정이 있습니다: ${labels}. 시간을 변경하거나 기존 일정을 먼저 확인해 주세요.`);
      }
    }
    const inserted = await addCalendarTask(input);
    const id = String(inserted.id || "");
    if (!id) throw new Error("일정 저장 결과에서 ID를 확인하지 못했어요.");
    const task = await getCalendarTask(id);
    if (!task) throw new Error("저장한 일정을 다시 확인하지 못했어요.");
    verifyCalendarFields(task, input);
    return { tool: name, success: true, data: { taskId: id, resourceId: id, task, summary: `"${text(input, "title")}" 일정을 추가했어요.` }, verification: createVerification({ executed: true, persisted: true, resourceExists: true }) };
  }
  if (name === "calendar_add_bulk") {
    const tasks = Array.isArray(input.tasks) ? input.tasks as any[] : [];
    const created: Array<{ index: number; taskId: string; task: Record<string, unknown> }> = [];
    const failed: Array<{ index: number; title: string; error: string }> = [];
    for (const [index, requested] of tasks.entries()) {
      try {
        const inserted = await addCalendarTask(requested);
        const taskId = String(inserted.id || "");
        const readBack = taskId ? await getCalendarTask(taskId) : null;
        if (!readBack) throw new Error("저장한 일정을 다시 확인하지 못했어요.");
        verifyCalendarFields(readBack, requested);
        created.push({ index, taskId, task: readBack });
      } catch (error) {
        failed.push({ index, title: String(requested.title || ""), error: error instanceof Error ? error.message : "저장 실패" });
      }
    }
    const data = { requestedCount: tasks.length, successCount: created.length, failedCount: failed.length, created, failed };
    if (failed.length) {
      return { tool: name, success: false, code: created.length ? "PARTIAL_SUCCESS" : "BULK_FAILED", error: `일정 ${tasks.length}건 중 ${created.length}건 저장, ${failed.length}건 실패했어요.`, data, verification: createVerification({ executed: true, persisted: false, resourceExists: created.length > 0, details: { requestedCount: tasks.length, successCount: created.length, failedCount: failed.length } }) };
    }
    return { tool: name, success: true, data: { ...data, summary: `일정 ${created.length}건을 추가했어요.` }, verification: createVerification({ executed: true, persisted: true, resourceExists: true, details: { requestedCount: tasks.length, successCount: created.length, failedCount: 0 } }) };
  }
  if (name === "calendar_update") {
    const id = await resolveCalendarTaskId(input);
    const fields = { ...input };
    delete fields.matchTitle;
    const updated = await updateCalendarTask({ ...fields, id });
    const task = await getCalendarTask(id);
    if (!task) throw new Error("수정한 일정을 다시 확인하지 못했어요.");
    if (updated.id !== task.id) throw new Error("일정 수정 결과를 재조회한 row와 연결하지 못했어요.");
    for (const [key, value] of Object.entries(fields)) {
      if (["id", "date"].includes(key) && value === undefined) continue;
      if (value !== undefined && key in task && task[key] !== value) throw new Error(`일정 수정 검증이 일치하지 않아요: ${key}`);
    }
    return { tool: name, success: true, data: { taskId: id, resourceId: id, task, summary: "일정을 수정했어요." }, verification: createVerification({ executed: true, persisted: true, resourceExists: true }) };
  }
  if (name === "calendar_complete") {
    const id = await resolveCalendarTaskId(input);
    await updateCalendarTask({ id, completed: true });
    const task = await getCalendarTask(id);
    if (!task || task.completed !== true) throw new Error("일정 완료 상태가 실제로 저장되지 않았어요.");
    return { tool: name, success: true, data: { taskId: id, resourceId: id, task, summary: "일정을 완료 처리했어요." }, verification: createVerification({ executed: true, persisted: true, resourceExists: true, details: { completed: true } }) };
  }
  if (name === "calendar_delete") {
    const id = await resolveCalendarTaskId(input);
    const trashItem = await deleteCalendarTask(id);
    if (!trashItem?.id || trashItem.source_id !== id) throw new Error("일정을 휴지통으로 이동했는지 확인하지 못했어요.");
    const task = await getCalendarTask(id);
    if (task) throw new Error("일정 삭제 후에도 원본 일정이 남아 있어요.");
    return { tool: name, success: true, data: { taskId: id, resourceId: id, trashId: trashItem.id, summary: "일정을 삭제했어요(휴지통에서 복원 가능)." }, verification: createVerification({ executed: true, persisted: true, resourceExists: false, details: { movedToTrash: true } }) };
  }
  if (name === "calendar_availability") {
    const existing = await listCalendarTasks(text(input, "date"));
    const conflicts = input.time ? findCalendarConflicts(existing, input.time as string, 60) : [];
    return { tool: name, success: true, data: { date: text(input, "date"), conflicts, hasConflict: conflicts.length > 0 } };
  }
  if (name === "calendar_list_month") {
    const range = calendarMonthRange(text(input, "month"));
    const { data: tasks, error } = await db
      .from("calendar_tasks")
      .select("*")
      .gte("date", range.start)
      .lt("date", range.endExclusive)
      .order("date", { ascending: true })
      .order("time", { ascending: true, nullsFirst: false });
    if (error) throw new Error(error.message);
    return { tool: name, success: true, data: { month: text(input, "month"), ...range, tasks: tasks ?? [] }, verification: createVerification({ executed: true }) };
  }

  throw new Error("지원하지 않는 Olivia 작업이에요.");
}
