import { NextRequest } from "next/server";
import { isAdminSession } from "@/lib/passkey";
import { checkHermesHealth } from "@/lib/hermes/client";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Secure Tunnel 개편 §3 — Olivia diagnostics가 "HERMES ONLINE"/"HERMES OFFLINE"을 표시할 수
// 있게 하는 조회 전용 endpoint. 채팅 스트림과 완전히 분리되어 있어(별도 5초 timeout) 이 호출
// 자체가 실패해도 채팅 기능에는 영향이 없다.
export async function GET(request: NextRequest) {
  if (!isAdminSession(request)) {
    return Response.json({ ok: false, error: "관리자 로그인이 필요합니다." }, { status: 401 });
  }

  const result = await checkHermesHealth();
  return Response.json({
    ok: true,
    label: result.online ? "HERMES ONLINE" : "HERMES OFFLINE",
    ...result,
  });
}
