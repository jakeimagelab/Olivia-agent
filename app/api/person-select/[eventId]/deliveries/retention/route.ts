import type { NextRequest } from "next/server";
import { deliveryExpiresAt } from "@/lib/person-select/deliveries";
import { isAdminSession } from "@/lib/passkey";
import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function PATCH(request: NextRequest, context: { params: Promise<{ eventId: string }> }) {
  if (!isAdminSession(request)) return Response.json({ ok: false, error: "관리자 로그인이 필요합니다." }, { status: 401 });
  const { eventId } = await context.params;
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const db = getSupabaseAdmin();
  const { data: event } = await db.from("person_select_events")
    .select("id,access_mode,delivery_retention_days,delivery_approved_at,delivery_retention_extended_until")
    .eq("id", eventId).maybeSingle();
  if (!event) return Response.json({ ok: false, error: "프로젝트를 찾을 수 없습니다." }, { status: 404 });
  let approvedAt = event.delivery_approved_at as string | null;
  let extendedUntil = event.delivery_retention_extended_until as string | null;
  let targetTable = "person_select_events";
  let targetId = eventId;
  if (event.access_mode !== "project_shared") {
    const personId = typeof body.personId === "string" ? body.personId : "";
    if (!personId) return Response.json({ ok: false, error: "보관 기간을 연장할 고객을 선택해 주세요." }, { status: 400 });
    const { data: person } = await db.from("person_select_people").select("id,delivery_approved_at,delivery_retention_extended_until")
      .eq("id", personId).eq("event_id", eventId).maybeSingle();
    if (!person) return Response.json({ ok: false, error: "이 프로젝트의 고객이 아닙니다." }, { status: 404 });
    approvedAt = person.delivery_approved_at; extendedUntil = person.delivery_retention_extended_until;
    targetTable = "person_select_people"; targetId = person.id;
  }
  if (!approvedAt) return Response.json({ ok: false, error: "최종 확인된 보정본만 보관 기간을 연장할 수 있습니다." }, { status: 409 });
  const currentExpiry = deliveryExpiresAt({ approvedAt, retentionDays: event.delivery_retention_days ?? 30, extendedUntil });
  const next = new Date(Math.max(Date.now(), currentExpiry ? new Date(currentExpiry).getTime() : Date.now()) + 30 * 86_400_000).toISOString();
  const { error } = await db.from(targetTable).update({ delivery_retention_extended_until: next, delivery_files_purged_at: null, updated_at: new Date().toISOString() }).eq("id", targetId);
  if (error) throw error;
  return Response.json({ ok: true, expiresAt: next });
}
