import { NextRequest } from "next/server";
import { isAdminSession } from "@/lib/passkey";
import { getSupabaseAdmin } from "@/lib/supabase";
import { validateChoiceInput } from "@/lib/person-select/core";

export async function PATCH(request: NextRequest, context: { params: Promise<{ eventId: string; choiceId: string }> }) {
  if (!isAdminSession(request)) return Response.json({ ok: false, error: "관리자 로그인이 필요합니다." }, { status: 401 });
  const { eventId, choiceId } = await context.params; const db = getSupabaseAdmin();
  const body = await request.json().catch(() => ({})) as { retouch_keys?: unknown; memo?: unknown };
  const [{ data: choice }, { data: event }] = await Promise.all([
    db.from("person_select_choices").select("*").eq("id", choiceId).eq("event_id", eventId).maybeSingle(),
    db.from("person_select_events").select("retouch_options,memo_max").eq("id", eventId).maybeSingle(),
  ]);
  if (!choice || !event) return Response.json({ ok: false, error: "선택 정보를 찾을 수 없습니다." }, { status: 404 });
  const validation = validateChoiceInput({ retouchKeys: body.retouch_keys ?? choice.retouch_keys, memo: body.memo ?? choice.memo, allowedKeys: (event.retouch_options as { key: string }[]).map((item) => item.key), memoMax: event.memo_max });
  if (validation) return Response.json({ ok: false, error: validation }, { status: 400 });
  await db.from("person_select_choice_history").insert({ choice_id: choice.id, person_id: choice.person_id, category_key: choice.category_key, image_id: choice.image_id, retouch_keys: choice.retouch_keys, memo: choice.memo, action: "admin_edit" });
  const { data, error } = await db.from("person_select_choices").update({ retouch_keys: body.retouch_keys ?? choice.retouch_keys, memo: body.memo ?? choice.memo, updated_at: new Date().toISOString() }).eq("id", choice.id).select("*").single();
  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });
  return Response.json({ ok: true, choice: data });
}
