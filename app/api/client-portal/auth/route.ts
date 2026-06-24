import { NextRequest, NextResponse } from "next/server";
import { validatePortalToken, logPortalEvent } from "@/lib/clientPortal";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token") ?? req.headers.get("x-portal-token") ?? "";
  if (!token) return NextResponse.json({ ok: false, error: "토큰 없음" }, { status: 401 });

  const session = await validatePortalToken(token);
  if (!session) return NextResponse.json({ ok: false, error: "유효하지 않은 링크이거나 만료되었습니다." }, { status: 401 });

  await logPortalEvent({
    clientId: session.clientId,
    eventType: "portal_accessed",
    workflowRunId: session.workflowRunId,
  });

  return NextResponse.json({ ok: true, session });
}
