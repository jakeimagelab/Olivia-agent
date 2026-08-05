import type { SupabaseClient } from "@supabase/supabase-js";

const SYNCED_CATEGORIES = ["shooting", "client"];

function summarize(row: { date: string; time: string | null; location: string | null }): string {
  const parts = [row.date, row.time || ""].filter(Boolean).join(" ");
  return row.location ? `${parts} · ${row.location}` : parts;
}

// 캘린더(촬영/고객 일정)에 등록된 큰 프로젝트를 워크스페이스 할일에 자동으로 띄운다.
// 캘린더 항목 1개당 워크스페이스 할일 1개만 생기도록 team_tasks.calendar_task_id로 연결하고,
// 이미 연동된 항목은 다시 만들지 않는다. 과거 이력이 한꺼번에 쏟아지지 않도록 최근 2주 이내
// ~ 미래 일정만 대상으로 한다.
export async function syncCalendarProjects(db: SupabaseClient, actorId: string): Promise<void> {
  const cutoff = new Date(Date.now() - 14 * 86400000).toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });

  const { data: candidates } = await db
    .from("calendar_tasks")
    .select("id, title, date, time, location, category")
    .in("category", SYNCED_CATEGORIES)
    .gte("date", cutoff);
  if (!candidates?.length) return;

  const candidateIds = candidates.map((row) => row.id);
  const { data: linked } = await db
    .from("team_tasks")
    .select("id, calendar_task_id, title")
    .in("calendar_task_id", candidateIds);
  const linkedByCalendarId = new Map((linked ?? []).map((row) => [row.calendar_task_id as string, row]));

  const toCreate = candidates.filter((row) => !linkedByCalendarId.has(row.id));
  if (toCreate.length) {
    await db.from("team_tasks").insert(
      toCreate.map((row) => ({
        title: row.title,
        description: summarize(row),
        calendar_task_id: row.id,
        created_by: actorId,
        status: "todo",
      })),
    );
  }

  const retitled = candidates.filter((row) => {
    const existing = linkedByCalendarId.get(row.id);
    return existing && existing.title !== row.title;
  });
  await Promise.all(
    retitled.map((row) =>
      db.from("team_tasks").update({ title: row.title }).eq("id", linkedByCalendarId.get(row.id)!.id),
    ),
  );
}
