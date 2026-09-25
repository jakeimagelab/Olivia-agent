import { NextRequest } from "next/server";
// PHASE 4 작업 6(2026-09-25) — legacy(Claude) 경로. 웹 채팅은 이 라우트를 쓰지 않는다 —
// 웹 채팅의 유일한 엔드포인트는 app/api/olivia/v2/stream이다.
import { processOliviaRequest } from "@/lib/assistant/core/legacyOliviaCore";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const body = await req.json();
  return processOliviaRequest(body, req);
}
