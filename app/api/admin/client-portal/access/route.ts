import { NextRequest, NextResponse } from "next/server";
import { createPortalAccess, revokePortalAccess } from "@/lib/clientPortal";
import { getSupabaseAdmin } from "@/lib/supabase";
import { isPcrmUuid } from "@/lib/pcrm/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET: 특정 고객의 포털 접근 현황 조회
export async function GET(req: NextRequest) {
  const clientId = req.nextUrl.searchParams.get("clientId");
  const workflowRunId = req.nextUrl.searchParams.get("workflowRunId");
  if (!isPcrmUuid(clientId)) return NextResponse.json({ ok: false, error: "clientId가 올바르지 않습니다." }, { status: 400 });
  if (workflowRunId && !isPcrmUuid(workflowRunId)) return NextResponse.json({ ok: false, error: "프로젝트 ID가 올바르지 않습니다." }, { status: 400 });

  const db = getSupabaseAdmin();
  const { data } = await db
    .from("client_portal_access")
    .select("id, workflow_run_id, access_token, email, token_expires_at, is_active, last_login_at, access_count, created_at")
    .eq("client_id", clientId)
    .order("created_at", { ascending: false });

  const scoped = workflowRunId
    ? (data ?? []).filter((row) => row.workflow_run_id === workflowRunId)
    : data ?? [];
  const active = scoped.find(r => r.is_active);
  return NextResponse.json({ ok: true, accesses: scoped, activeAccess: active ?? null });
}

// POST: 신규 토큰 생성
export async function POST(req: NextRequest) {
  const { clientId, workflowRunId, email, expiresInDays } = await req.json();
  if (!isPcrmUuid(clientId) || !isPcrmUuid(workflowRunId)) {
    return NextResponse.json({ ok: false, error: "고객과 프로젝트를 선택해 주세요." }, { status: 400 });
  }
  const db = getSupabaseAdmin();
  const { data: run } = await db.from("workflow_runs").select("id").eq("id", workflowRunId).eq("client_id", clientId).maybeSingle();
  if (!run) return NextResponse.json({ ok: false, error: "고객에게 연결된 프로젝트를 찾을 수 없습니다." }, { status: 404 });

  const result = await createPortalAccess({ clientId, workflowRunId, email, expiresInDays: expiresInDays ?? 90 });
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://olivia-agent.vercel.app";
  const portalUrl = `${baseUrl}/client-portal/access/${result.token}`;

  return NextResponse.json({ ok: true, token: result.token, expiresAt: result.expiresAt, portalUrl });
}

// DELETE: 포털 접근 비활성화
export async function DELETE(req: NextRequest) {
  const { clientId, workflowRunId } = await req.json();
  if (!isPcrmUuid(clientId) || !isPcrmUuid(workflowRunId)) {
    return NextResponse.json({ ok: false, error: "고객과 프로젝트를 선택해 주세요." }, { status: 400 });
  }

  await revokePortalAccess(clientId, workflowRunId);
  return NextResponse.json({ ok: true });
}
