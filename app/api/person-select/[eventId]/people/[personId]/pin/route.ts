import { NextRequest } from "next/server";
import { isAdminSession } from "@/lib/passkey";
import { getSupabaseAdmin } from "@/lib/supabase";
import { createUniquePin } from "@/lib/person-select/core";

export async function POST(request: NextRequest, context: { params: Promise<{ eventId: string; personId: string }> }) {
  if (!isAdminSession(request)) return Response.json({ ok: false, error: "관리자 로그인이 필요합니다." }, { status: 401 });
  const { eventId, personId } = await context.params; const db = getSupabaseAdmin();
  const { data: people } = await db.from("person_select_people").select("pin_code").eq("event_id", eventId);
  const pin = createUniquePin((people ?? []).map((item) => item.pin_code));
  const { error } = await db.from("person_select_people").update({ pin_code: pin, updated_at: new Date().toISOString() }).eq("event_id", eventId).eq("id", personId);
  if (error) return Response.json({ ok: false, error: error.message }, { status: 400 });
  return Response.json({ ok: true, pin });
}
