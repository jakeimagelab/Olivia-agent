import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { isAdminSession } from "@/lib/passkey";
import { approvePhotoProject } from "@/lib/core/commands/photo";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  if (!isAdminSession(request)) return Response.json({ ok: false, error: "관리자 로그인이 필요합니다." }, { status: 401 });
  const { id } = await context.params;
  if (!UUID_PATTERN.test(id)) return Response.json({ ok: false, error: "올바르지 않은 프로젝트 ID입니다." }, { status: 400 });

  try {
    const db = getSupabaseAdmin();
    const result = await approvePhotoProject(db, id);
    if (!result.ok) {
      const status = result.code === "INVALID_STATE" || result.code === "STATE_CHANGED" || result.code === "CLASSIFICATION_CONTEXT_REQUIRED"
        ? 409
        : result.reason === "프로젝트를 찾을 수 없습니다." ? 404 : 500;
      return Response.json({ ok: false, error: result.reason, code: result.code }, { status });
    }
    return Response.json({ ok: true, project: result.value.project, idempotent: Boolean(result.idempotent) });
  } catch (error) {
    console.error("[photo-storage approve]", error);
    return Response.json({ ok: false, error: "프로젝트 승인에 실패했습니다." }, { status: 500 });
  }
}
