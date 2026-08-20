import type { SupabaseClient } from "@supabase/supabase-js";

// 캘린더에서 "촬영" 카테고리 일정을 등록/수정하면, location(병원명)이 일치하는 진행 중인
// 프로젝트(workflow_runs)의 shoot_date도 같이 맞춘다 — 지금까지는 캘린더 일정과 프로젝트의
// 촬영일이 완전히 별개로 관리돼서, 캘린더에 촬영을 등록해도 프로젝트 쪽엔 아무 흔적이
// 안 남았다. 정확히 일치하는 병원이 없거나 여러 곳이 걸리면 아무것도 바꾸지 않는다(잘못된
// 프로젝트를 건드리는 것보다 안전).
export async function syncShootDateToWorkflow(
  db: SupabaseClient,
  input: { category?: string | null; location?: string | null; date: string },
): Promise<void> {
  if (input.category !== "shooting" || !input.location?.trim()) return;
  const hospital = input.location.trim();

  const { data: runs, error } = await db
    .from("workflow_runs")
    .select("id, client_name, shoot_date")
    .eq("status", "active")
    .ilike("client_name", `%${hospital}%`);
  if (error || !runs || runs.length !== 1) return;

  const run = runs[0];
  if (run.shoot_date === input.date) return;
  await db.from("workflow_runs").update({ shoot_date: input.date, updated_at: new Date().toISOString() }).eq("id", run.id);
}
