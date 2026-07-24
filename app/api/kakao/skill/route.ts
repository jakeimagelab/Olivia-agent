import { createHash } from "node:crypto";
import { after, NextRequest, NextResponse } from "next/server";
import {
  buildKakaoCallbackResponse,
  buildKakaoConfirmationResponse,
  buildKakaoTextResponse,
  buildKakaoWebLinkResponse,
} from "@/lib/assistant/channels/kakao/messageBuilder";
import {
  parseKakaoConfirmationCommand,
  parseKakaoLinkCommand,
  parseKakaoSkillPayload,
} from "@/lib/assistant/channels/kakao/parser";
import {
  getKakaoSkillSecretHeader,
  isKakaoSkillConfigured,
  verifyKakaoSkillSecret,
} from "@/lib/assistant/channels/kakao/requestSecurity";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
export const preferredRegion = "icn1";

const KAKAO_RESPONSE_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, x-api-key, x-olivia-kakao-skill-secret",
  "Cache-Control": "no-store",
} as const;

function kakaoJson(
  response: object,
  status = 200,
) {
  return NextResponse.json(response, {
    status,
    headers: KAKAO_RESPONSE_HEADERS,
  });
}

export function GET() {
  return kakaoJson(
    buildKakaoTextResponse("Olivia 스킬 서버가 정상적으로 연결되었습니다."),
  );
}

export function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: KAKAO_RESPONSE_HEADERS,
  });
}

function eventKeyForRequest(
  req: NextRequest,
  botUserKey: string,
  utterance: string,
): string {
  const requestId = req.headers.get("x-request-id")?.trim();
  if (requestId) return requestId.slice(0, 200);
  const twoMinuteBucket = Math.floor(Date.now() / 120_000);
  return createHash("sha256")
    .update(`${botUserKey}:${utterance}:${twoMinuteBucket}`)
    .digest("hex");
}

export async function POST(req: NextRequest) {
  if (!isKakaoSkillConfigured()) {
    return kakaoJson(
      buildKakaoTextResponse(
        "카카오 연동 설정이 아직 완료되지 않았습니다. Olivia 웹에서 연결 상태를 확인해 주세요.",
      ),
    );
  }
  if (
    !verifyKakaoSkillSecret(
      getKakaoSkillSecretHeader(req.headers),
    )
  ) {
    return kakaoJson(
      buildKakaoTextResponse("요청을 확인할 수 없습니다."),
      403,
    );
  }

  let rawPayload: unknown;
  try {
    rawPayload = await req.json();
  } catch {
    return kakaoJson(
      buildKakaoTextResponse("Olivia 스킬 서버가 정상적으로 연결되었습니다."),
    );
  }

  let parsed: ReturnType<typeof parseKakaoSkillPayload>;
  try {
    parsed = parseKakaoSkillPayload(rawPayload);
  } catch {
    return kakaoJson(
      buildKakaoTextResponse("Olivia 스킬 서버가 정상적으로 연결되었습니다."),
    );
  }

  const [
    { getSupabaseAdmin },
    { connectKakaoOwnerWithCode, findKakaoOwner },
  ] = await Promise.all([
    import("@/lib/supabase"),
    import("@/lib/assistant/owners/service"),
  ]);
  const db = getSupabaseAdmin();
  let webhookEventId: string | null = null;
  try {
    const linkCommand = parseKakaoLinkCommand(parsed.utterance);
    const owner = linkCommand
      ? null
      : await findKakaoOwner(db, parsed.botUserKey);

    if (!linkCommand && !owner) {
      return kakaoJson(
        buildKakaoTextResponse(
          "등록되지 않은 계정입니다. Olivia 웹에서 연결 코드를 발급한 뒤 ‘올리비아 연결 123456’ 형식으로 입력해 주세요.",
        ),
      );
    }

    const eventKey = eventKeyForRequest(
      req,
      parsed.botUserKey,
      parsed.utterance,
    );
    const payloadDigest = createHash("sha256")
      .update(JSON.stringify(rawPayload))
      .digest("hex");
    const { data: webhookEvent, error: webhookError } = await db
      .from("assistant_webhook_events")
      .insert({
        provider: "kakao_skill",
        event_key: eventKey,
        payload_digest: payloadDigest,
        sanitized_payload: {
          botId: parsed.botId,
          blockId: parsed.blockId,
          hasCallback: Boolean(parsed.callbackUrl),
          isFriend: parsed.isFriend,
        },
        status: "processing",
      })
      .select("id")
      .single();
    if (webhookError?.code === "23505") {
      return kakaoJson(
        buildKakaoTextResponse("이미 접수한 요청입니다. 잠시만 기다려 주세요."),
      );
    }
    if (webhookError) throw new Error(webhookError.message);
    webhookEventId = webhookEvent.id;

    if (linkCommand) {
      const connectedOwner = await connectKakaoOwnerWithCode(
        db,
        linkCommand.code,
        {
          botUserKey: parsed.botUserKey,
          plusfriendUserKey: parsed.plusfriendUserKey,
          appUserId: parsed.appUserId,
        },
      );
      await db
        .from("assistant_webhook_events")
        .update({
          status: "processed",
          processed_at: new Date().toISOString(),
          owner_id: connectedOwner?.id ?? null,
        })
        .eq("id", webhookEvent.id);
      return kakaoJson(
        buildKakaoTextResponse(
          connectedOwner
            ? "대표자 계정과 연결되었습니다. 이제 Olivia에게 업무를 요청할 수 있어요."
            : "연결 코드가 올바르지 않거나 만료되었습니다. Olivia 웹에서 새 코드를 발급해 주세요.",
        ),
      );
    }

    if (!owner) {
      return kakaoJson(
        buildKakaoTextResponse(
          "등록되지 않은 계정입니다. Olivia 웹에서 연결 코드를 발급한 뒤 ‘올리비아 연결 123456’ 형식으로 입력해 주세요.",
        ),
      );
    }

    await db
      .from("assistant_channel_connections")
      .update({ last_received_at: new Date().toISOString() })
      .eq("owner_id", owner.id)
      .eq("channel", "kakao")
      .eq("status", "active");
    await db
      .from("assistant_webhook_events")
      .update({ owner_id: owner.id })
      .eq("id", webhookEvent.id);

    const {
      getOrCreateAssistantConversation,
      listAssistantMessages,
      saveAssistantMessage,
    } = await import("@/lib/assistant/conversations/service");
    const conversation = await getOrCreateAssistantConversation(db, owner.id);
    const saved = await saveAssistantMessage(db, {
      ownerId: owner.id,
      conversationId: conversation.id,
      role: "user",
      content: parsed.utterance,
      channel: "kakao",
      externalMessageId: eventKey,
      metadata: {
        clientRequestId: eventKey,
        isFriend: parsed.isFriend,
      },
    });
    if (saved.duplicate) {
      return kakaoJson(
        buildKakaoTextResponse("이미 처리한 요청입니다. 잠시만 기다려 주세요."),
      );
    }

    const confirmation = parseKakaoConfirmationCommand(parsed.utterance);
    if (confirmation) {
      const [
        { claimAssistantConfirmation },
        { executeApprovedAssistantAction },
      ] = await Promise.all([
        import("@/lib/assistant/confirmations/service"),
        import("@/lib/assistant/core/oliviaCore"),
      ]);
      const action = await claimAssistantConfirmation(db, {
        token: confirmation.token,
        ownerId: owner.id,
        decision: confirmation.decision,
      });
      let text = "이미 처리되었거나 만료된 확인 요청입니다.";
      if (action && confirmation.decision === "cancel") {
        text = "요청을 취소했습니다.";
      } else if (action) {
        const result = await executeApprovedAssistantAction({
          db,
          req,
          ownerId: owner.id,
          actionRequestId: action.id,
        });
        text = result?.message || "요청을 처리했습니다.";
      }
      await saveAssistantMessage(db, {
        ownerId: owner.id,
        conversationId: conversation.id,
        role: "assistant",
        content: text,
        channel: "kakao",
        parentMessageId: saved.message.id,
      });
      await db
        .from("assistant_webhook_events")
        .update({ status: "processed", processed_at: new Date().toISOString() })
        .eq("id", webhookEvent.id);
      return kakaoJson(buildKakaoTextResponse(text));
    }

    if (/음성(?:으로)?\s*(?:입력|명령|말하기)|말로\s*(?:요청|입력)/.test(parsed.utterance)) {
      const { issueAssistantVoiceSession } = await import(
        "@/lib/assistant/voice/service"
      );
      const voiceSession = await issueAssistantVoiceSession(db, {
        ownerId: owner.id,
        conversationId: conversation.id,
      });
      const baseUrl =
        process.env.NEXT_PUBLIC_BASE_URL ||
        process.env.NEXTAUTH_URL ||
        req.nextUrl.origin;
      const voiceUrl = new URL(
        `/assistant/voice/${encodeURIComponent(voiceSession.token)}`,
        baseUrl,
      ).toString();
      const text =
        "아래 버튼을 눌러 말씀해 주세요. 링크는 10분 동안 한 번만 사용할 수 있습니다.";
      await saveAssistantMessage(db, {
        ownerId: owner.id,
        conversationId: conversation.id,
        role: "assistant",
        content: text,
        channel: "kakao",
        parentMessageId: saved.message.id,
        metadata: { messageType: "voice_link", voiceSessionId: voiceSession.id },
      });
      await db
        .from("assistant_webhook_events")
        .update({ status: "processed", processed_at: new Date().toISOString() })
        .eq("id", webhookEvent.id);
      return kakaoJson(
        buildKakaoWebLinkResponse({
          title: "Olivia 음성 입력",
          description: text,
          label: "음성으로 말하기",
          url: voiceUrl,
        }),
      );
    }

    if (
      parsed.callbackUrl &&
      process.env.KAKAO_CALLBACK_ENABLED === "true"
    ) {
      const { encryptAssistantSecret } = await import(
        "@/lib/assistant/security"
      );
      const { error: jobError } = await db.from("assistant_jobs").insert({
        owner_id: owner.id,
        job_type: "kakao_message",
        payload: {
          ownerId: owner.id,
          conversationId: conversation.id,
          messageId: saved.message.id,
          requestId: eventKey,
          callbackUrlEncrypted: encryptAssistantSecret(parsed.callbackUrl),
        },
        status: "queued",
        priority: 80,
        idempotency_key: `kakao-message:${eventKey}`,
      });
      if (jobError?.code !== "23505" && jobError) throw new Error(jobError.message);
      const backgroundRequest = new NextRequest(req.url, {
        headers: req.headers,
      });
      after(async () => {
        const { processAssistantJobs } = await import(
          "@/lib/assistant/jobs/service"
        );
        await processAssistantJobs({
          db: getSupabaseAdmin(),
          req: backgroundRequest,
          workerId: `kakao-${eventKey}`,
          limit: 1,
        }).catch(() => undefined);
      });
      await db
        .from("assistant_webhook_events")
        .update({ status: "processed", processed_at: new Date().toISOString() })
        .eq("id", webhookEvent.id);
      return kakaoJson(buildKakaoCallbackResponse());
    }

    const { processOliviaChannelMessage } = await import(
      "@/lib/assistant/core/oliviaCore"
    );
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
      requestId: eventKey,
      messages: history.map((message: any) => ({
        role: message.role,
        content: message.content,
      })),
    });
    const text = result.text;
    await saveAssistantMessage(db, {
      ownerId: owner.id,
      conversationId: conversation.id,
      role: "assistant",
      content: text,
      channel: "kakao",
      parentMessageId: saved.message.id,
      metadata:
        result.kind === "confirmation"
          ? {
              messageType: "confirmation",
              actionRequestId: result.actionRequestId,
            }
          : {},
    });
    await db
      .from("assistant_webhook_events")
      .update({ status: "processed", processed_at: new Date().toISOString() })
      .eq("id", webhookEvent.id);

    return kakaoJson(
      result.kind === "confirmation"
        ? buildKakaoConfirmationResponse({
            text,
            token: result.token,
          })
        : buildKakaoTextResponse(text),
    );
  } catch (error) {
    if (webhookEventId) {
      await db
        .from("assistant_webhook_events")
        .update({
          status: "failed",
          processed_at: new Date().toISOString(),
          error_code: "KAKAO_SKILL_PROCESSING_FAILED",
        })
        .eq("id", webhookEventId);
    }
    return kakaoJson(
      buildKakaoTextResponse(
        "요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.",
      ),
    );
  }
}
