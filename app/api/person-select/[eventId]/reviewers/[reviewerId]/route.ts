import type { NextRequest } from "next/server";
import { isAdminSession } from "@/lib/passkey";
import { parsePersonSelectReviewerInput } from "@/lib/person-select/reviewers";
import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function PATCH(request: NextRequest, context: { params: Promise<{ eventId: string; reviewerId: string }> }) {
  if (!isAdminSession(request)) return Response.json({ ok: false, error: "관리자 로그인이 필요합니다." }, { status: 401 });
  const { eventId, reviewerId } = await context.params;
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) return Response.json({ ok: false, error: "검토자 정보를 확인해 주세요." }, { status: 400 });
  const update: Record<string, unknown> = {};
  if (body.displayName !== undefined || body.roleLabel !== undefined) {
    const parsed = parsePersonSelectReviewerInput({ displayName: body.displayName, roleLabel: body.roleLabel });
    if ("error" in parsed) return Response.json({ ok: false, error: parsed.error }, { status: 400 });
    update.display_name = parsed.displayName;
    update.role_label = parsed.roleLabel;
  }
  if (body.active !== undefined) {
    if (typeof body.active !== "boolean") return Response.json({ ok: false, error: "활성 상태를 확인해 주세요." }, { status: 400 });
    update.active = body.active;
  }
  const permissions = [
    ["canViewAiResults", "can_view_ai_results"],
    ["canDownloadJpg", "can_download_jpg"],
    ["canDownloadRaw", "can_download_raw"],
    ["canFinalize", "can_finalize"],
  ] as const;
  for (const [inputKey, column] of permissions) {
    if (body[inputKey] === undefined) continue;
    if (typeof body[inputKey] !== "boolean") return Response.json({ ok: false, error: "검토자 권한을 확인해 주세요." }, { status: 400 });
    update[column] = body[inputKey];
  }
  if (!Object.keys(update).length) return Response.json({ ok: false, error: "변경할 검토자 정보가 없습니다." }, { status: 400 });
  update.updated_at = new Date().toISOString();
  const db = getSupabaseAdmin();
  const { data: current } = await db.from("person_select_shared_reviewers").select("is_legacy").eq("event_id", eventId).eq("id", reviewerId).maybeSingle();
  if (!current) return Response.json({ ok: false, error: "검토자를 찾을 수 없습니다." }, { status: 404 });
  if (current.is_legacy && update.active === false) return Response.json({ ok: false, error: "기존 공동 셀렉 호환 검토자는 비활성화할 수 없습니다." }, { status: 409 });
  if (current.is_legacy && update.can_finalize === false) return Response.json({ ok: false, error: "기존 공동 셀렉 링크의 최종 제출 권한은 끌 수 없습니다." }, { status: 409 });
  const { data, error } = await db.from("person_select_shared_reviewers").update(update).eq("event_id", eventId).eq("id", reviewerId).select("id,event_id,display_name,role_label,token_version,active,is_legacy,last_seen_at,can_view_ai_results,can_download_jpg,can_download_raw,can_finalize,created_at,updated_at").single();
  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });
  return Response.json({ ok: true, reviewer: data });
}
