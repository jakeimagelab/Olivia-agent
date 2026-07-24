import { NextRequest, NextResponse } from "next/server";
import { isAdminSession } from "@/lib/passkey";
import {
  getOrCreateAssistantConversation,
  listAssistantMessages,
  saveAssistantMessage,
} from "@/lib/assistant/conversations/service";
import { processOliviaChannelMessage } from "@/lib/assistant/core/oliviaCore";
import { ensurePrimaryAssistantOwner } from "@/lib/assistant/owners/service";
import { sanitizeRequestId, requireText } from "@/lib/assistant/validation";
import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  if (!isAdminSession(req)) {
    return NextResponse.json(
      { ok: false, error: "관리자 로그인이 필요합니다." },
      { status: 401 },
    );
  }
  try {
    const body = await req.json();
    const utterance = requireText(body.utterance, "메시지", { max: 10_000 });
    const requestId = sanitizeRequestId(
      body.requestId || `sim-${crypto.randomUUID()}`,
    );
    const db = getSupabaseAdmin();
    const owner = await ensurePrimaryAssistantOwner(db);
    const conversation = await getOrCreateAssistantConversation(db, owner.id);
    const saved = await saveAssistantMessage(db, {
      ownerId: owner.id,
      conversationId: conversation.id,
      role: "user",
      content: utterance,
      channel: "kakao",
      externalMessageId: requestId,
      metadata: { simulated: true, clientRequestId: requestId },
    });
    if (saved.duplicate) {
      return NextResponse.json({
        ok: true,
        duplicate: true,
        text: "이미 처리한 요청입니다.",
      });
    }

    const history = await listAssistantMessages(
      db,
      owner.id,
      conversation.id,
      20,
    );
    const result = await processOliviaChannelMessage({
      db,
      req,
      ownerId: owner.id,
      conversationId: conversation.id,
      messageId: saved.message.id,
      channel: "kakao",
      requestId,
      messages: history.map((message: any) => ({
        role: message.role,
        content: message.content,
      })),
    });

    const assistantText =
      result.kind === "confirmation"
        ? `${result.text}\n\n확인 요청은 ${new Date(result.expiresAt).toLocaleTimeString("ko-KR")}까지 유효합니다.`
        : result.text;
    const assistantMessage = await saveAssistantMessage(db, {
      ownerId: owner.id,
      conversationId: conversation.id,
      role: "assistant",
      content: assistantText,
      channel: "kakao",
      parentMessageId: saved.message.id,
      metadata:
        result.kind === "confirmation"
          ? {
              simulated: true,
              messageType: "confirmation",
              actionRequestId: result.actionRequestId,
            }
          : { simulated: true },
    });
    return NextResponse.json({
      ok: true,
      conversationId: conversation.id,
      messageId: assistantMessage.message.id,
      ...result,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "카카오 시뮬레이션에 실패했습니다.",
      },
      { status: 500 },
    );
  }
}
