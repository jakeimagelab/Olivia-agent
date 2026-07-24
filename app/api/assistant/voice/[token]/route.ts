import OpenAI from "openai";
import { NextRequest, NextResponse } from "next/server";
import {
  listAssistantMessages,
  saveAssistantMessage,
} from "@/lib/assistant/conversations/service";
import { processOliviaChannelMessage } from "@/lib/assistant/core/oliviaCore";
import {
  claimAssistantVoiceSession,
  findAssistantVoiceSession,
} from "@/lib/assistant/voice/service";
import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_AUDIO_BYTES = 20 * 1024 * 1024;
const ALLOWED_AUDIO_TYPES = new Set([
  "audio/webm",
  "audio/mp4",
  "audio/mpeg",
  "audio/wav",
  "audio/x-wav",
  "audio/ogg",
  "audio/x-m4a",
]);

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  try {
    const session = await findAssistantVoiceSession(getSupabaseAdmin(), token);
    return session
      ? NextResponse.json({
          ok: true,
          expiresAt: session.expires_at,
        })
      : NextResponse.json(
          { ok: false, error: "만료되었거나 사용할 수 없는 음성 입력 링크입니다." },
          { status: 410 },
        );
  } catch {
    return NextResponse.json(
      { ok: false, error: "음성 입력 링크를 확인하지 못했습니다." },
      { status: 500 },
    );
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const db = getSupabaseAdmin();
  let session: any = null;
  try {
    const formData = await req.formData();
    const audio = formData.get("audio");
    if (!(audio instanceof File)) {
      return NextResponse.json(
        { ok: false, error: "녹음 파일이 없습니다." },
        { status: 400 },
      );
    }
    if (
      audio.size <= 0 ||
      audio.size > MAX_AUDIO_BYTES ||
      !ALLOWED_AUDIO_TYPES.has(audio.type)
    ) {
      return NextResponse.json(
        { ok: false, error: "지원하지 않거나 너무 큰 녹음 파일입니다." },
        { status: 400 },
      );
    }
    session = await claimAssistantVoiceSession(db, token);
    if (!session) {
      return NextResponse.json(
        { ok: false, error: "만료되었거나 이미 사용한 음성 입력 링크입니다." },
        { status: 410 },
      );
    }
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error("음성 인식 설정이 필요합니다.");
    const openai = new OpenAI({ apiKey });
    const transcript = await openai.audio.transcriptions.create({
      file: audio,
      model: "whisper-1",
      language: "ko",
      response_format: "text",
      prompt:
        "포토클리닉, 올리비아, 병원명, 고객명, 프로젝트명, 촬영, 견적, 계약, 셀렉, 보정",
    });
    const text = String(transcript || "").trim();
    if (!text) throw new Error("음성을 인식하지 못했습니다. 다시 말씀해 주세요.");

    const userMessage = await saveAssistantMessage(db, {
      ownerId: session.owner_id,
      conversationId: session.conversation_id,
      role: "user",
      content: text,
      channel: "voice",
      externalMessageId: `voice:${session.id}`,
      metadata: { voiceSessionId: session.id },
    });
    const history = await listAssistantMessages(
      db,
      session.owner_id,
      session.conversation_id,
      20,
    );
    const result = await processOliviaChannelMessage({
      db,
      req,
      ownerId: session.owner_id,
      conversationId: session.conversation_id,
      messageId: userMessage.message.id,
      channel: "voice",
      requestId: `voice-${session.id}`,
      messages: history.map((message: any) => ({
        role: message.role,
        content: message.content,
      })),
    });
    const assistantMessage = await saveAssistantMessage(db, {
      ownerId: session.owner_id,
      conversationId: session.conversation_id,
      role: "assistant",
      content: result.text,
      channel: "voice",
      parentMessageId: userMessage.message.id,
      metadata:
        result.kind === "confirmation"
          ? {
              messageType: "confirmation",
              actionRequestId: result.actionRequestId,
            }
          : {},
    });
    await db
      .from("assistant_voice_sessions")
      .update({
        status: "completed",
        transcript: text.slice(0, 20_000),
        message_id: assistantMessage.message.id,
      })
      .eq("id", session.id)
      .eq("status", "processing");
    return NextResponse.json({
      ok: true,
      transcript: text,
      ...result,
    });
  } catch (error) {
    if (session?.id) {
      await db
        .from("assistant_voice_sessions")
        .update({ status: "failed" })
        .eq("id", session.id)
        .eq("status", "processing");
    }
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error ? error.message : "음성 요청 처리에 실패했습니다.",
      },
      { status: 500 },
    );
  }
}
