import { NextRequest } from "next/server";
import { isAdminSession } from "@/lib/passkey";
import { planPersonLoginNameUpdates } from "@/lib/person-select/loginNames";
import { getSupabaseAdmin } from "@/lib/supabase";

export async function POST(request: NextRequest, context: { params: Promise<{ eventId: string }> }) {
  if (!isAdminSession(request)) return Response.json({ ok: false, error: "관리자 로그인이 필요합니다." }, { status: 401 });
  const body = await request.json().catch(() => null) as { confirm?: unknown } | null;
  if (body?.confirm !== true) return Response.json({ ok: false, error: "로그인 이름 변경 확인이 필요합니다." }, { status: 400 });

  const { eventId } = await context.params;
  const db = getSupabaseAdmin();
  const [{ data: event }, { data: people, error: peopleError }] = await Promise.all([
    db.from("person_select_events").select("id,title,access_mode").eq("id", eventId).maybeSingle(),
    db.from("person_select_people").select("id,event_id,display_name,login_name,pin_code").eq("event_id", eventId).order("display_name"),
  ]);
  if (!event) return Response.json({ ok: false, error: "프로젝트를 찾을 수 없습니다." }, { status: 404 });
  if (event.access_mode === "project_shared") return Response.json({ ok: false, error: "공용 링크 프로젝트에는 개인 로그인 이름이 없습니다." }, { status: 409 });
  if (peopleError) return Response.json({ ok: false, error: peopleError.message }, { status: 500 });

  const rows = people ?? [];
  const plan = planPersonLoginNameUpdates(rows);
  if (plan.conflicts.length) {
    const detail = plan.conflicts.map((item) => `${item.loginName}: ${item.people.map((person) => person.displayName).join(" / ")}`).join(", ");
    return Response.json({ ok: false, code: "LOGIN_NAME_CONFLICT", error: `직책을 빼면 로그인 이름이 겹칩니다. 먼저 이름을 확인해 주세요. (${detail})`, ...plan }, { status: 409 });
  }
  if (!plan.updates.length) return Response.json({ ok: true, updatedCount: 0, ...plan });

  const now = new Date().toISOString();
  const byId = new Map(rows.map((row) => [row.id, row]));
  const updates = plan.updates.map((item) => {
    const row = byId.get(item.id)!;
    return { id: row.id, event_id: eventId, display_name: row.display_name, login_name: item.nextLoginName, pin_code: row.pin_code, updated_at: now };
  });
  const { error: updateError } = await db.from("person_select_people").upsert(updates, { onConflict: "id" });
  if (updateError) return Response.json({ ok: false, error: updateError.message }, { status: 500 });
  return Response.json({ ok: true, updatedCount: updates.length, ...plan });
}
