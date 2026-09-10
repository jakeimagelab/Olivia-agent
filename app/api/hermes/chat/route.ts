import { NextRequest } from "next/server";
import { isHermesFallbackSafe, runHermesChat } from "@/lib/hermes/client";
import type { HermesChatContext } from "@/lib/hermes/types";
import { isAdminSession } from "@/lib/passkey";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

function isInternalServerRequest(request: NextRequest): boolean {
  const key = process.env.INTERNAL_API_KEY;
  if (!key) return false;
  return request.headers.get("x-internal-key") === key;
}

export async function POST(request: NextRequest) {
  // 관리자 세션(브라우저 쿠키) 또는 내부 서버 호출(Telegram webhook 등, app/api/telegram/route.ts와
  // 동일한 x-internal-key 패턴) 둘 중 하나만 통과하면 된다 — Telegram은 브라우저 쿠키가 없다.
  if (!isAdminSession(request) && !isInternalServerRequest(request)) {
    return Response.json({ success: false, error: "관리자 로그인이 필요합니다." }, { status: 401 });
  }

  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const message = typeof body.message === "string" ? body.message.trim() : "";
  if (!message) return Response.json({ success: false, error: "메시지를 입력해주세요." }, { status: 400 });

  const rawContext = body.context && typeof body.context === "object" && !Array.isArray(body.context)
    ? body.context as Record<string, unknown>
    : {};
  const context: HermesChatContext = {
    activeClientId: typeof rawContext.activeClientId === "string" ? rawContext.activeClientId : undefined,
    activeProjectId: typeof rawContext.activeProjectId === "string" ? rawContext.activeProjectId : undefined,
    activeWorkspace: typeof rawContext.activeWorkspace === "string" ? rawContext.activeWorkspace : undefined,
    todayDate: typeof rawContext.todayDate === "string" ? rawContext.todayDate : undefined,
    focusDate: typeof rawContext.focusDate === "string" ? rawContext.focusDate : undefined,
  };

  try {
    const result = await runHermesChat({
      message,
      conversationId: typeof body.conversationId === "string" ? body.conversationId : undefined,
      context,
      signal: request.signal,
    });
    return Response.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Hermes Agent 요청에 실패했습니다.";
    return Response.json({ success: false, error: message, fallbackSafe: isHermesFallbackSafe(error) }, { status: 502 });
  }
}
