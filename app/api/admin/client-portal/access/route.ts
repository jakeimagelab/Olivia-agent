import { NextRequest, NextResponse } from "next/server";
import { createPortalAccess, revokePortalAccess } from "@/lib/clientPortal";
import { getSupabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET: 특정 고객의 포털 접근 현황 조회
export async function GET(req: NextRequest) {
  const clientId = req.nextUrl.searchParams.get("clientId");
  if (!clientId) return NextResponse.json({ ok: false, error: "clientId 필요" }, { status: 400 });

  const db = getSupabaseAdmin();
  const { data } = await db
    .from("client_portal_access")
    .select("id, access_token, email, token_expires_at, is_active, last_login_at, created_at")
    .eq("client_id", clientId)
    .order("created_at", { ascending: false });

  const active = (data ?? []).find(r => r.is_active);
  return NextResponse.json({ ok: true, accesses: data ?? [], activeAccess: active ?? null });
}

// POST: 신규 토큰 생성
export async function POST(req: NextRequest) {
  const { clientId, email, expiresInDays } = await req.json();
  if (!clientId) return NextResponse.json({ ok: false, error: "clientId 필요" }, { status: 400 });

  const result = await createPortalAccess({ clientId, email, expiresInDays: expiresInDays ?? 90 });
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://olivia-agent.vercel.app";
  const portalUrl = `${baseUrl}/client-portal/access/${result.token}`;

  return NextResponse.json({ ok: true, token: result.token, expiresAt: result.expiresAt, portalUrl });
}

// DELETE: 포털 접근 비활성화
export async function DELETE(req: NextRequest) {
  const { clientId } = await req.json();
  if (!clientId) return NextResponse.json({ ok: false, error: "clientId 필요" }, { status: 400 });

  await revokePortalAccess(clientId);
  return NextResponse.json({ ok: true });
}
