import type { NextRequest } from "next/server";
import { isAdminSession } from "@/lib/passkey";
import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function PATCH(request: NextRequest, context: { params: Promise<{ eventId: string }> }) {
  if (!isAdminSession(request)) return Response.json({ ok: false, error: "관리자 로그인이 필요합니다." }, { status: 401 });
  const { eventId } = await context.params;
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  if (body.action !== "reopen") return Response.json({ ok: false, error: "지원하지 않는 상태 변경입니다." }, { status: 400 });
  const db = getSupabaseAdmin();
  const { data: event } = await db.from("person_select_events").select("id,access_mode").eq("id", eventId).maybeSingle();
  if (!event) return Response.json({ ok: false, error: "프로젝트를 찾을 수 없습니다." }, { status: 404 });
  const now = new Date().toISOString();
  if (event.access_mode === "project_shared") {
    const { error } = await db.from("person_select_events").update({ delivery_state: "reviewing", delivery_approved_at: null, updated_at: now }).eq("id", eventId);
    if (error) throw error;
  } else {
    const personId = typeof body.personId === "string" ? body.personId : "";
    if (!personId) return Response.json({ ok: false, error: "다시 열 고객을 선택해 주세요." }, { status: 400 });
    const { data, error } = await db.from("person_select_people").update({ delivery_state: "reviewing", delivery_approved_at: null, updated_at: now })
      .eq("id", personId).eq("event_id", eventId).select("id").maybeSingle();
    if (error) throw error;
    if (!data) return Response.json({ ok: false, error: "이 프로젝트의 고객이 아닙니다." }, { status: 404 });
  }
  return Response.json({ ok: true, state: "reviewing" });
}
