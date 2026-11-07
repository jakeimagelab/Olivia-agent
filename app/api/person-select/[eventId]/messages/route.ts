import type { NextRequest } from "next/server";
import { isAdminSession } from "@/lib/passkey";
import { parsePersonSelectProjectMessage, publicPersonSelectProjectMessage } from "@/lib/person-select/sharedMessages";
import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

const MESSAGE_SELECT = "id,event_id,reviewer_id,admin_actor,image_id,body,client_request_id,created_at,person_select_shared_reviewers(display_name,role_label),person_select_images(original_file_name)";

export async function GET(request: NextRequest, context: { params: Promise<{ eventId: string }> }) {
  if (!isAdminSession(request)) return Response.json({ ok: false, error: "관리자 로그인이 필요합니다." }, { status: 401 });
  const { eventId } = await context.params;
  const { data, error } = await getSupabaseAdmin().from("person_select_project_messages").select(MESSAGE_SELECT).eq("event_id", eventId).order("created_at").order("id").limit(300);
  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });
  return Response.json({ ok: true, messages: (data ?? []).map((row) => ({ ...publicPersonSelectProjectMessage(row), own: Boolean(row.admin_actor) })) });
}

export async function POST(request: NextRequest, context: { params: Promise<{ eventId: string }> }) {
  if (!isAdminSession(request)) return Response.json({ ok: false, error: "관리자 로그인이 필요합니다." }, { status: 401 });
  const { eventId } = await context.params;
  try {
    const parsed = parsePersonSelectProjectMessage(await request.json().catch(() => null));
    const db = getSupabaseAdmin();
    const { data: event, error: eventError } = await db.from("person_select_events").select("id,access_mode").eq("id", eventId).maybeSingle();
    if (eventError) throw eventError;
    if (!event) return Response.json({ ok: false, error: "프로젝트를 찾을 수 없습니다." }, { status: 404 });
    if (event.access_mode !== "project_shared") return Response.json({ ok: false, error: "프로젝트 공용 링크 방식에서만 대화할 수 있습니다." }, { status: 409 });
    if (parsed.imageId) {
      const { data: image } = await db.from("person_select_images").select("id").eq("id", parsed.imageId).eq("event_id", eventId).maybeSingle();
      if (!image) return Response.json({ ok: false, error: "이 프로젝트의 사진만 대화 대상으로 지정할 수 있습니다." }, { status: 400 });
    }
    const { data, error } = await db.from("person_select_project_messages").insert({
      event_id: eventId,
      reviewer_id: null,
      admin_actor: "포토클리닉",
      image_id: parsed.imageId,
      body: parsed.body,
      client_request_id: parsed.requestId,
    }).select(MESSAGE_SELECT).single();
    if (error) {
      if (error.code !== "23505") throw error;
      const { data: existing, error: existingError } = await db.from("person_select_project_messages").select(MESSAGE_SELECT).eq("event_id", eventId).eq("client_request_id", parsed.requestId).single();
      if (existingError) throw existingError;
      return Response.json({ ok: true, created: false, message: { ...publicPersonSelectProjectMessage(existing), own: true } });
    }
    return Response.json({ ok: true, created: true, message: { ...publicPersonSelectProjectMessage(data), own: true } });
  } catch (error) {
    return Response.json({ ok: false, error: error instanceof Error ? error.message : "메시지를 보내지 못했습니다." }, { status: 400 });
  }
}
