import { NextResponse } from "next/server";
import { revokePortalAccess } from "@/lib/clientPortal";
import { getSupabaseAdmin } from "@/lib/supabase";
import { recordPcrmActivitySafely } from "@/lib/pcrm/activity";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Params = { params: Promise<{ clientId: string }> };

// 고객 단위 포털 토큰(workflow_run_id가 null인 것)만 끊는다 — 프로젝트별 구형 토큰은 건드리지 않는다.
export async function POST(_req: Request, { params }: Params) {
  const { clientId } = await params;
  await revokePortalAccess(clientId);
  const db = getSupabaseAdmin();
  await recordPcrmActivitySafely(db, {
    clientId,
    actorType: "admin",
    actorName: "관리자",
    actionType: "portal_revoked",
    title: "고객 포털 공유가 중지됨",
  });
  return NextResponse.json({ ok: true });
}
