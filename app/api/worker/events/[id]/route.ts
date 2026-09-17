import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { isAdminSession } from "@/lib/passkey";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ALLOWED_STATUSES = new Set(["ACKNOWLEDGED", "STARTED", "COMPLETED", "DISMISSED"]);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// §12 "[나중에]: 이벤트 삭제 금지" — 여기서는 status만 바꾸고 절대 delete하지 않는다.
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isAdminSession(request)) {
    return Response.json({ ok: false, error: "관리자 로그인이 필요합니다." }, { status: 401 });
  }

  const { id } = await params;
  if (!UUID_PATTERN.test(id)) {
    return Response.json({ ok: false, error: "올바르지 않은 이벤트 ID입니다." }, { status: 400 });
  }

  const body = await request.json().catch(() => ({}));
  const status = typeof body.status === "string" ? body.status.trim().toUpperCase() : "";
  if (!ALLOWED_STATUSES.has(status)) {
    return Response.json({ ok: false, error: "지원하지 않는 status입니다." }, { status: 400 });
  }

  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("worker_events")
      .update({
        status,
        ...(status === "ACKNOWLEDGED" ? { acknowledged_at: new Date().toISOString() } : {}),
      })
      .eq("id", id)
      .select("id,status")
      .maybeSingle();

    if (error) throw error;
    if (!data) return Response.json({ ok: false, error: "이벤트를 찾지 못했습니다." }, { status: 404 });

    return Response.json({ ok: true, id: data.id, status: data.status });
  } catch (error) {
    console.error("[worker/events PATCH]", error);
    return Response.json({ ok: false, error: error instanceof Error ? error.message : "이벤트 상태 변경 실패" }, { status: 500 });
  }
}
