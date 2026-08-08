import { NextResponse } from "next/server";
import { ensurePortalAccess } from "@/lib/clientPortal";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

// 마이그레이션 이전에 만들어져 포털이 없는 기존 고객을 위한 수동 생성 버튼용 — 새 고객은
// createClientWithWorkflow()가 등록 시점에 자동으로 포털을 만들어서 평소엔 필요 없다.
export async function POST(_req: Request, { params }: Params) {
  const { id: clientId } = await params;
  const portal = await ensurePortalAccess({ clientId });
  return NextResponse.json({ ok: true, token: portal.token });
}
