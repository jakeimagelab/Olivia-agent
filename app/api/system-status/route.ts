import { NextRequest } from "next/server";
import { isAdminSession } from "@/lib/passkey";
import { collectSystemStatus } from "@/lib/system-status/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** 관리자용 읽기 전용 진단 API. 환경변수 값이나 실제 파일시스템 경로는 반환하지 않는다. */
export async function GET(request: NextRequest) {
  if (!isAdminSession(request)) {
    return Response.json({ ok: false, error: "관리자 로그인이 필요합니다." }, { status: 401 });
  }

  const report = await collectSystemStatus();
  return Response.json(report, {
    headers: { "Cache-Control": "no-store" },
  });
}
