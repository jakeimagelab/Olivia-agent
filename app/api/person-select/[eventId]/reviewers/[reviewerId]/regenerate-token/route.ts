import type { NextRequest } from "next/server";
import { isAdminSession } from "@/lib/passkey";
import { createPersonSelectReviewerToken } from "@/lib/person-select/reviewers";
import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest, context: { params: Promise<{ eventId: string; reviewerId: string }> }) {
  if (!isAdminSession(request)) return Response.json({ ok: false, error: "관리자 로그인이 필요합니다." }, { status: 401 });
  const { eventId, reviewerId } = await context.params;
  const db = getSupabaseAdmin();
  const { data: current, error: currentError } = await db.from("person_select_shared_reviewers").select("id,is_legacy,token_version").eq("event_id", eventId).eq("id", reviewerId).maybeSingle();
  if (currentError) return Response.json({ ok: false, error: currentError.message }, { status: 500 });
  if (!current) return Response.json({ ok: false, error: "검토자를 찾을 수 없습니다." }, { status: 404 });
  if (current.is_legacy) return Response.json({ ok: false, error: "기존 공용 링크는 프로젝트 설정의 공용 링크 재발급을 사용해 주세요." }, { status: 409 });
  const created = createPersonSelectReviewerToken();
  const { data, error } = await db.from("person_select_shared_reviewers").update({
    access_token_hash: created.tokenHash,
    token_version: Number(current.token_version ?? 1) + 1,
    active: true,
    updated_at: new Date().toISOString(),
  }).eq("id", reviewerId).select("id,event_id,display_name,role_label,token_version,active,is_legacy,last_seen_at,created_at,updated_at").single();
  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });
  return Response.json({ ok: true, reviewer: data, token: created.token });
}
