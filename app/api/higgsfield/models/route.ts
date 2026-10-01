import { NextRequest, NextResponse } from "next/server";
import { isAdminSession } from "@/lib/passkey";
import { getVideoModelCapabilities, higgsfieldConnectionState } from "@/lib/higgsfield/adapter";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  if (!isAdminSession(request)) return NextResponse.json({ ok: false, error: "관리자 로그인이 필요합니다." }, { status: 401 });
  return NextResponse.json({ ok: true, connection: higgsfieldConnectionState(), models: getVideoModelCapabilities() }, {
    headers: { "Cache-Control": "private, max-age=300" },
  });
}
