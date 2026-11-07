import type { NextRequest } from "next/server";
import { isAdminSession } from "@/lib/passkey";
import { createPersonSelectReviewerToken, parsePersonSelectReviewerInput } from "@/lib/person-select/reviewers";
import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, context: { params: Promise<{ eventId: string }> }) {
  if (!isAdminSession(request)) return Response.json({ ok: false, error: "관리자 로그인이 필요합니다." }, { status: 401 });
  const { eventId } = await context.params;
  const { data, error } = await getSupabaseAdmin()
    .from("person_select_shared_reviewers")
    .select("id,event_id,display_name,role_label,token_version,active,is_legacy,last_seen_at,created_at,updated_at")
    .eq("event_id", eventId)
    .order("is_legacy", { ascending: false })
    .order("created_at", { ascending: true });
  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });
  return Response.json({ ok: true, reviewers: data ?? [] });
}

export async function POST(request: NextRequest, context: { params: Promise<{ eventId: string }> }) {
  if (!isAdminSession(request)) return Response.json({ ok: false, error: "관리자 로그인이 필요합니다." }, { status: 401 });
  const { eventId } = await context.params;
  const parsed = parsePersonSelectReviewerInput(await request.json().catch(() => null));
  if ("error" in parsed) return Response.json({ ok: false, error: parsed.error }, { status: 400 });
  const db = getSupabaseAdmin();
  const { data: event, error: eventError } = await db.from("person_select_events").select("id,access_mode").eq("id", eventId).maybeSingle();
  if (eventError) return Response.json({ ok: false, error: eventError.message }, { status: 500 });
  if (!event) return Response.json({ ok: false, error: "프로젝트를 찾을 수 없습니다." }, { status: 404 });
  if (event.access_mode !== "project_shared") return Response.json({ ok: false, error: "프로젝트 공용 링크 방식에서만 검토자를 추가할 수 있습니다." }, { status: 409 });
  const created = createPersonSelectReviewerToken();
  const { data, error } = await db.from("person_select_shared_reviewers").insert({
    event_id: eventId,
    display_name: parsed.displayName,
    role_label: parsed.roleLabel,
    access_token_hash: created.tokenHash,
    active: true,
    is_legacy: false,
  }).select("id,event_id,display_name,role_label,token_version,active,is_legacy,last_seen_at,created_at,updated_at").single();
  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });
  return Response.json({ ok: true, reviewer: data, token: created.token });
}
