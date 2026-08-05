import type { SupabaseClient } from "@supabase/supabase-js";

const SYNCED_CATEGORIES = ["shooting", "client"];

function summarize(row: { date: string; time: string | null; location: string | null }): string {
  const parts = [row.date, row.time || ""].filter(Boolean).join(" ");
  return row.location ? `${parts} · ${row.location}` : parts;
}

function offsetDateStr(days: number): string {
  return new Date(Date.now() + days * 86400000).toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });
}

// 캘린더(촬영/고객 일정)에 등록된 큰 프로젝트를 워크스페이스 할일에 자동으로 띄운다.
// 캘린더 항목 1개당 워크스페이스 할일 1개만 생기도록 team_tasks.calendar_task_id로 연결하고,
// 이미 연동된 항목은 다시 만들지 않는다.
//
// 새로 "생성"하는 것은 가까운 일정(-3일~+21일)만으로 제한한다 — 몇 달 뒤 일정까지 미리 다
// 만들어두면 할일 목록이 금방 넘쳐서 정작 급한 일이 묻힌다. 반면 "제목/날짜 동기화"는 이미
// 만들어진 항목이면 기간 제한 없이(최근 60일 이후 일정 전체) 갱신한다 — due_date를 캘린더
// 날짜와 항상 맞춰둬야 목록 화면에서 날짜별로 정렬·그룹핑할 수 있다.
export async function syncCalendarProjects(db: SupabaseClient, actorId: string): Promise<void> {
  const backfillFrom = offsetDateStr(-60);
  const createFrom = offsetDateStr(-3);
  const createTo = offsetDateStr(21);

  const { data: candidates } = await db
    .from("calendar_tasks")
    .select("id, title, date, time, location, category")
    .in("category", SYNCED_CATEGORIES)
    .gte("date", backfillFrom);
  if (!candidates?.length) return;

  const candidateIds = candidates.map((row) => row.id);
  const { data: linked } = await db
    .from("team_tasks")
    .select("id, calendar_task_id, title, due_date")
    .in("calendar_task_id", candidateIds);
  const linkedByCalendarId = new Map((linked ?? []).map((row) => [row.calendar_task_id as string, row]));

  const toCreate = candidates.filter(
    (row) => !linkedByCalendarId.has(row.id) && row.date >= createFrom && row.date <= createTo,
  );
  if (toCreate.length) {
    await db.from("team_tasks").insert(
      toCreate.map((row) => ({
        title: row.title,
        description: summarize(row),
        calendar_task_id: row.id,
        due_date: row.date,
        created_by: actorId,
        status: "todo",
      })),
    );
  }

  const toResync = candidates.filter((row) => {
    const existing = linkedByCalendarId.get(row.id);
    return existing && (existing.title !== row.title || existing.due_date !== row.date);
  });
  await Promise.all(
    toResync.map((row) =>
      db.from("team_tasks").update({ title: row.title, due_date: row.date }).eq("id", linkedByCalendarId.get(row.id)!.id),
    ),
  );
}
