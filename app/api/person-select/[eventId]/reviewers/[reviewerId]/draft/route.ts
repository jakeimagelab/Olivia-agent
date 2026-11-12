import type { NextRequest } from "next/server";
import { isAdminSession } from "@/lib/passkey";
import { sharedDraftResponse } from "@/lib/person-select/sharedPublic";
import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, context: { params: Promise<{ eventId: string; reviewerId: string }> }) {
  if (!isAdminSession(request)) return Response.json({ ok: false, error: "관리자 로그인이 필요합니다." }, { status: 401 });
  const { eventId, reviewerId } = await context.params;
  const { data, error } = await getSupabaseAdmin()
    .from("person_select_shared_drafts")
    .select("revision,items,customer_memo,updated_at")
    .eq("event_id", eventId)
    .eq("reviewer_id", reviewerId)
    .maybeSingle();
  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });
  return Response.json({ ok: true, draft: sharedDraftResponse(data) }, {
    headers: { "Cache-Control": "private, no-store" },
  });
}
