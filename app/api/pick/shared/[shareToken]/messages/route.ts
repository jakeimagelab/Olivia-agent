import { NextRequest } from "next/server";
import { resolveSharedPersonSelectAccess } from "@/lib/person-select/sharedPublic";
import { parsePersonSelectProjectMessage, publicPersonSelectProjectMessage } from "@/lib/person-select/sharedMessages";
import { enforcePublicSelectionRateLimit, publicSelectionErrorResponse, readPublicSelectionJson } from "@/lib/select-gallery/publicSelection";
import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

const MESSAGE_SELECT = "id,event_id,reviewer_id,admin_actor,image_id,body,client_request_id,created_at,person_select_shared_reviewers(display_name,role_label),person_select_images(original_file_name)";

export async function GET(request: NextRequest, context: { params: Promise<{ shareToken: string }> }) {
  const { shareToken } = await context.params;
  try {
    const db = getSupabaseAdmin();
    await enforcePublicSelectionRateLimit({ db, request, token: shareToken, action: "person-shared-messages-read", limit: 180 });
    const { event, reviewer } = await resolveSharedPersonSelectAccess(db, shareToken);
    const { data, error } = await db
      .from("person_select_project_messages")
      .select(MESSAGE_SELECT)
      .eq("event_id", event.id)
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .limit(300);
    if (error) throw error;
    return Response.json({ ok: true, messages: (data ?? []).map((row) => publicPersonSelectProjectMessage(row, reviewer.id)) });
  } catch (error) {
    return publicSelectionErrorResponse(error);
  }
}

export async function POST(request: NextRequest, context: { params: Promise<{ shareToken: string }> }) {
  const { shareToken } = await context.params;
  try {
    const db = getSupabaseAdmin();
    await enforcePublicSelectionRateLimit({ db, request, token: shareToken, action: "person-shared-messages-write", limit: 30, windowSeconds: 60 });
    const { event, reviewer } = await resolveSharedPersonSelectAccess(db, shareToken);
    const parsed = parsePersonSelectProjectMessage(await readPublicSelectionJson(request, 10_000));
    if (parsed.imageId) {
      const { data: image } = await db.from("person_select_images").select("id").eq("id", parsed.imageId).eq("event_id", event.id).maybeSingle();
      if (!image) throw new Error("이 프로젝트의 사진만 대화 대상으로 지정할 수 있습니다.");
    }
    const values = {
      event_id: event.id,
      reviewer_id: reviewer.id,
      admin_actor: null,
      image_id: parsed.imageId,
      body: parsed.body,
      client_request_id: parsed.requestId,
    };
    const { data, error } = await db.from("person_select_project_messages").insert(values).select(MESSAGE_SELECT).single();
    if (error) {
      if (error.code !== "23505") throw error;
      const { data: existing, error: existingError } = await db
        .from("person_select_project_messages")
        .select(MESSAGE_SELECT)
        .eq("event_id", event.id)
        .eq("client_request_id", parsed.requestId)
        .single();
      if (existingError) throw existingError;
      return Response.json({ ok: true, created: false, message: publicPersonSelectProjectMessage(existing, reviewer.id) });
    }
    return Response.json({ ok: true, created: true, message: publicPersonSelectProjectMessage(data, reviewer.id) });
  } catch (error) {
    return publicSelectionErrorResponse(error);
  }
}
