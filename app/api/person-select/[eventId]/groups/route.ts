import { NextRequest } from "next/server";
import { isAdminSession } from "@/lib/passkey";
import { getSupabaseAdmin } from "@/lib/supabase";

export async function PUT(request: NextRequest, context: { params: Promise<{ eventId: string }> }) {
  if (!isAdminSession(request)) return Response.json({ ok: false, error: "관리자 로그인이 필요합니다." }, { status: 401 });
  const { eventId } = await context.params; const body = await request.json().catch(() => ({})) as { assignments?: unknown };
  if (!Array.isArray(body.assignments)) return Response.json({ ok: false, error: "담임 반 연결 값이 필요합니다." }, { status: 400 });
  const db = getSupabaseAdmin();
  const assignments = body.assignments as { group: string; person_id: string | null }[];
  const personIds = assignments.map((item) => item.person_id).filter(Boolean);
  if (new Set(personIds).size !== personIds.length) return Response.json({ ok: false, error: "한 선생님을 두 반에 연결할 수 없습니다." }, { status: 400 });
  await db.from("person_select_people").update({ group_label: null, updated_at: new Date().toISOString() }).eq("event_id", eventId);
  for (const item of assignments) {
    if (!item.person_id) continue;
    const { error } = await db.from("person_select_people").update({ group_label: item.group, updated_at: new Date().toISOString() }).eq("event_id", eventId).eq("id", item.person_id);
    if (error) return Response.json({ ok: false, error: error.message }, { status: 400 });
  }
  return Response.json({ ok: true });
}
