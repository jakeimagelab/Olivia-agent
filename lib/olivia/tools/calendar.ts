import { getSupabaseAdmin } from "@/lib/supabase";
import { moveRecordToTrash } from "@/lib/trash";
import { categorizeByTitle } from "@/lib/calendarCategorize";
import { OliviaToolError } from "@/lib/olivia/v2/toolError";

// lib/assistant/core/legacyOliviaCore.ts에서 그대로 옮긴 캘린더 CRUD — Olivia 채팅 도구
// (레거시 Claude 경로, v2 OpenAI 경로) 양쪽이 같은 구현을 공유한다. 동작은 옮기기 전과
// 동일한 구현을 공유한다. 요청한 필드를 조용히 버리는 스키마 fallback은 허용하지 않는다.
export async function listCalendarTasks(date: string) {
  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("calendar_tasks")
    .select("*")
    .eq("date", date)
    .order("time", { ascending: true, nullsFirst: false });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function getCalendarTask(id: string) {
  const db = getSupabaseAdmin();
  const { data, error } = await db.from("calendar_tasks").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  return data ?? null;
}

export async function addCalendarTask(input: any) {
  const db = getSupabaseAdmin();
  // AI가 category를 명시적으로 안 골라서 넘긴 경우(특히 calendar_add_bulk는 스키마에 category
  // 파라미터가 아예 없다) "general"로 뭉개지 않고 제목 키워드로 추측한다 — calendar page의
  // 수동 입력 폼과 같은 기준(lib/calendarCategorize.ts)을 쓴다.
  const base = {
    date: input.date,
    title: input.title,
    memo: input.memo ?? "",
    category: input.category || categorizeByTitle(input.title ?? ""),
    completed: input.completed ?? false,
    time: input.time ?? null,
    end_time: input.end_time ?? null,
    location: input.location ?? null,
  };

  const { data, error } = await db
    .from("calendar_tasks")
    .insert(base)
    .select("*")
    .single();
  if (error || !data) throw new OliviaToolError(error?.message || "일정을 저장하지 못했습니다.", "DB_ERROR");
  return data as Record<string, unknown>;
}

export async function updateCalendarTask(input: Record<string, unknown>) {
  const db = getSupabaseAdmin();
  const { id, ...fields } = input;
  if (!id) throw new Error("수정할 일정 ID가 없습니다.");

  const { data, error } = await db
    .from("calendar_tasks")
    .update({ ...fields, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("*")
    .single();
  if (error || !data) throw new OliviaToolError(error?.message || "일정을 수정하지 못했습니다.", "DB_ERROR");
  return data as Record<string, unknown>;
}

export async function deleteCalendarTask(id: string) {
  const db = getSupabaseAdmin();
  return moveRecordToTrash(db, "calendar_task", id);
}

export async function resolveCalendarTaskId(input: any) {
  if (input.id) return input.id;
  if (!input.date || !input.matchTitle) {
    throw new Error("수정/삭제/완료할 일정의 ID 또는 날짜+제목 일부가 필요합니다.");
  }

  const tasks: any[] = await listCalendarTasks(input.date);
  const keyword = String(input.matchTitle).trim().toLowerCase();
  const matches = tasks.filter((task) => String(task.title || "").toLowerCase().includes(keyword));
  if (matches.length > 1) {
    const candidates = matches.map((task) => ({ id: task.id, title: task.title, date: task.date, time: task.time ?? null }));
    throw new OliviaToolError(`"${input.matchTitle}"와 일치하는 일정이 여러 개예요. 어느 일정을 수정할지 선택해주세요.`, "AMBIGUOUS", { candidates });
  }
  const found = matches[0];
  if (!found) {
    const list = tasks.map((task, index) => `${index + 1}. ${task.title} (${task.id})`).join("\n");
    throw new OliviaToolError(`${input.date}에서 "${input.matchTitle}" 일정을 찾지 못했어요.${list ? "\n\n가능한 일정:\n" + list : ""}`, "NOT_FOUND", { candidates: tasks.map((task) => ({ id: task.id, title: task.title, time: task.time ?? null })) });
  }

  return found.id;
}
