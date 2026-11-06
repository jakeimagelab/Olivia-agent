import { randomBytes } from "node:crypto";
import { NextRequest } from "next/server";
import { isAdminSession } from "@/lib/passkey";
import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest, context: { params: Promise<{ eventId: string }> }) {
  if (!isAdminSession(request)) return Response.json({ ok: false, error: "관리자 로그인이 필요합니다." }, { status: 401 });
  const { eventId } = await context.params;
  const db = getSupabaseAdmin();
  const { data: event } = await db.from("person_select_events").select("id,access_mode,shared_token_version").eq("id", eventId).maybeSingle();
  if (!event) return Response.json({ ok: false, error: "프로젝트를 찾을 수 없습니다." }, { status: 404 });
  if (event.access_mode !== "project_shared") return Response.json({ ok: false, error: "공유 프로젝트에서만 링크를 다시 만들 수 있습니다." }, { status: 409 });
  const { data, error } = await db.from("person_select_events").update({
    shared_token: randomBytes(32).toString("hex"),
    shared_token_version: Number(event.shared_token_version ?? 1) + 1,
    shared_link_active: true,
    updated_at: new Date().toISOString(),
  }).eq("id", eventId).select("shared_token,shared_token_version").single();
  if (error || !data) return Response.json({ ok: false, error: error?.message || "공용 링크를 다시 만들지 못했습니다." }, { status: 500 });
  return Response.json({ ok: true, sharedToken: data.shared_token, version: data.shared_token_version });
}
