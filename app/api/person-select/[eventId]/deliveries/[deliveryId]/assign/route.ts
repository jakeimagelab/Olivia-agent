import type { NextRequest } from "next/server";
import { isAdminSession } from "@/lib/passkey";
import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function PATCH(request: NextRequest, context: { params: Promise<{ eventId: string; deliveryId: string }> }) {
  if (!isAdminSession(request)) return Response.json({ ok: false, error: "관리자 로그인이 필요합니다." }, { status: 401 });
  const { eventId, deliveryId } = await context.params;
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const personId = typeof body.personId === "string" && body.personId ? body.personId : null;
  const groupLabel = typeof body.groupLabel === "string" ? body.groupLabel.trim().slice(0, 200) : null;
  const db = getSupabaseAdmin();
  const { data: event } = await db.from("person_select_events").select("id,access_mode").eq("id", eventId).maybeSingle();
  if (!event) return Response.json({ ok: false, error: "프로젝트를 찾을 수 없습니다." }, { status: 404 });
  if (event.access_mode === "individual") {
    if (!personId) return Response.json({ ok: false, error: "연결할 고객을 선택해 주세요." }, { status: 400 });
    const { data: person } = await db.from("person_select_people").select("id").eq("id", personId).eq("event_id", eventId).maybeSingle();
    if (!person) return Response.json({ ok: false, error: "이 프로젝트의 고객이 아닙니다." }, { status: 400 });
  }
  const update = event.access_mode === "project_shared"
    ? { person_id: null, group_label: groupLabel, link_method: "manual", updated_at: new Date().toISOString() }
    : { person_id: personId, group_label: null, link_method: "manual", updated_at: new Date().toISOString() };
  const { data, error } = await db.from("person_select_deliveries").update(update)
    .eq("id", deliveryId).eq("event_id", eventId).select("*").single();
  if (error) return Response.json({ ok: false, error: error.message }, { status: 400 });
  return Response.json({ ok: true, delivery: data });
}
