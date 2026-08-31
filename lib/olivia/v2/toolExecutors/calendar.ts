import { getSupabaseAdmin } from "@/lib/supabase";
import {
  addCalendarTask,
  deleteCalendarTask,
  listCalendarTasks,
  resolveCalendarTaskId,
  updateCalendarTask,
} from "@/lib/olivia/tools/calendar";
import { findCalendarConflicts } from "@/lib/assistant/actions/calendarAvailability";
import type { OliviaContextSnapshot, OliviaToolResult } from "@/lib/olivia/v2/types";
import { text } from "./common";

export const CALENDAR_TOOL_NAMES = [
  "calendar_list", "calendar_add", "calendar_add_bulk", "calendar_update",
  "calendar_complete", "calendar_delete", "calendar_availability", "calendar_list_month",
] as const;

export async function executeCalendarTool(
  name: string,
  input: Record<string, unknown>,
  _context: OliviaContextSnapshot,
): Promise<OliviaToolResult> {
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
    const id = await addCalendarTask(input);
    return { tool: name, success: true, data: { taskId: id, summary: `"${text(input, "title")}" 일정을 추가했어요.` } };
  }
  if (name === "calendar_add_bulk") {
    const tasks = Array.isArray(input.tasks) ? input.tasks as any[] : [];
    const created: string[] = [];
    for (const task of tasks) {
      const id = await addCalendarTask(task);
      if (id) created.push(id);
    }
    return { tool: name, success: true, data: { createdCount: created.length, taskIds: created, summary: `일정 ${created.length}건을 추가했어요.` } };
  }
  if (name === "calendar_update") {
    const id = await resolveCalendarTaskId(input);
    const { matchTitle: _matchTitle, ...fields } = input;
    await updateCalendarTask({ ...fields, id });
    return { tool: name, success: true, data: { taskId: id, summary: "일정을 수정했어요." } };
  }
  if (name === "calendar_complete") {
    const id = await resolveCalendarTaskId(input);
    await updateCalendarTask({ id, completed: true });
    return { tool: name, success: true, data: { taskId: id, summary: "일정을 완료 처리했어요." } };
  }
  if (name === "calendar_delete") {
    const id = await resolveCalendarTaskId(input);
    await deleteCalendarTask(id);
    return { tool: name, success: true, data: { taskId: id, summary: "일정을 삭제했어요(휴지통에서 복원 가능)." } };
  }
  if (name === "calendar_availability") {
    const existing = await listCalendarTasks(text(input, "date"));
    const conflicts = input.time ? findCalendarConflicts(existing, input.time as string, 60) : [];
    return { tool: name, success: true, data: { date: text(input, "date"), conflicts, hasConflict: conflicts.length > 0 } };
  }
  if (name === "calendar_list_month") {
    const { data: tasks, error } = await db
      .from("calendar_tasks")
      .select("*")
      .gte("date", `${text(input, "month")}-01`)
      .lt("date", `${text(input, "month")}-32`)
      .order("date", { ascending: true })
      .order("time", { ascending: true, nullsFirst: false });
    if (error) throw new Error(error.message);
    return { tool: name, success: true, data: { month: text(input, "month"), tasks: tasks ?? [] } };
  }

  throw new Error("지원하지 않는 Olivia 작업이에요.");
}
