import { createHash, randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  updateAssistantMessageDelivery,
} from "@/lib/assistant/conversations/service";
import {
  OLIVIA_ATTACHMENT_BUCKET,
  type OliviaChatAttachment,
  validateOliviaAttachmentInput,
} from "@/lib/olivia/chatAttachments";
import { toAsciiStorageSegment } from "@/lib/storageKey";

export function telegramInboundExternalId(chatId: string, messageId: string | number) {
  return `telegram:${chatId}:${messageId}`;
}

export function telegramAssistantExternalId(chatId: string, messageId: string | number) {
  return `${telegramInboundExternalId(chatId, messageId)}:assistant`;
}

export type TelegramWebhookClaim = {
  eventId?: string;
  claimed: boolean;
  status: "processing" | "processed";
};

export async function claimTelegramWebhook(
  db: SupabaseClient,
  input: {
    eventKey: string;
    ownerId: string;
    channelConnectionId: string;
    sanitizedPayload: Record<string, unknown>;
  },
): Promise<TelegramWebhookClaim> {
  const payloadDigest = createHash("sha256")
    .update(JSON.stringify(input.sanitizedPayload))
    .digest("hex");
  const { data: inserted, error: insertError } = await db
    .from("assistant_webhook_events")
    .insert({
      provider: "telegram",
      event_key: input.eventKey,
      owner_id: input.ownerId,
      channel_connection_id: input.channelConnectionId,
      payload_digest: payloadDigest,
      sanitized_payload: input.sanitizedPayload,
      status: "processing",
    })
    .select("id,status")
    .single();
  if (!insertError && inserted) return { eventId: inserted.id, claimed: true, status: "processing" };
  if (insertError?.code !== "23505") throw new Error(`Telegram webhook 접수 실패: ${insertError?.message || "unknown"}`);

  const { data: existing, error: existingError } = await db
    .from("assistant_webhook_events")
    .select("id,status,received_at")
    .eq("provider", "telegram")
    .eq("event_key", input.eventKey)
    .single();
  if (existingError || !existing) throw new Error(`Telegram webhook 중복 조회 실패: ${existingError?.message || "unknown"}`);
  if (existing.status === "processed") {
    return { eventId: existing.id, claimed: false, status: existing.status };
  }
  const staleProcessing = existing.status === "processing"
    && Date.now() - new Date(existing.received_at).getTime() > 2 * 60 * 1000;
  if (existing.status === "processing" && !staleProcessing) {
    return { eventId: existing.id, claimed: false, status: existing.status };
  }

  let claimQuery = db
    .from("assistant_webhook_events")
    .update({ status: "processing", error_code: null })
    .eq("id", existing.id);
  claimQuery = staleProcessing
    ? claimQuery.eq("status", "processing")
    : claimQuery.in("status", ["received", "failed"]);
  const { data: claimed, error: claimError } = await claimQuery
    .select("id")
    .maybeSingle();
  if (claimError) throw new Error(`Telegram webhook 재처리 확보 실패: ${claimError.message}`);
  return { eventId: existing.id, claimed: Boolean(claimed), status: "processing" };
}

export async function finishTelegramWebhook(
  db: SupabaseClient,
  eventId: string | undefined,
  status: "processed" | "failed" | "ignored",
  errorCode?: string,
) {
  if (!eventId) return;
  const { error } = await db
    .from("assistant_webhook_events")
    .update({
      status,
      processed_at: new Date().toISOString(),
      error_code: errorCode?.slice(0, 120) || null,
    })
    .eq("id", eventId);
  if (error) throw new Error(`Telegram webhook 상태 저장 실패: ${error.message}`);
}

export async function uploadTelegramAttachment(
  db: SupabaseClient,
  input: { fileName: string; mimeType: string; bytes: Uint8Array },
): Promise<OliviaChatAttachment> {
  const validated = validateOliviaAttachmentInput({
    fileName: input.fileName,
    mimeType: input.mimeType,
    fileSize: input.bytes.byteLength,
  });
  if (!validated.ok) throw new Error(validated.error);
  const id = randomUUID();
  const extension = validated.value.fileName.split(".").pop()?.toLowerCase() || "file";
  const storageName = toAsciiStorageSegment(validated.value.fileName, `attachment.${extension}`).slice(0, 180);
  const storagePath = `uploads/${new Date().toISOString().slice(0, 10)}/${id}/${storageName}`;
  const { error } = await db.storage
    .from(OLIVIA_ATTACHMENT_BUCKET)
    .upload(storagePath, input.bytes, { contentType: validated.value.mimeType, upsert: false });
  if (error) throw new Error(`Telegram 첨부 저장 실패: ${error.message}`);
  return {
    id,
    storagePath,
    fileName: validated.value.fileName,
    mimeType: validated.value.mimeType,
    sizeBytes: validated.value.fileSize,
    kind: validated.value.kind,
    analysisStatus: validated.value.analysisStatus,
  };
}

export async function deliverTelegramAssistantMessage(
  db: SupabaseClient,
  input: {
    ownerId: string;
    conversationId: string;
    messageId: string;
    externalRequestId: string;
    send: () => Promise<void>;
  },
) {
  const { data: previous } = await db
    .from("assistant_delivery_attempts")
    .select("id,attempt_count")
    .eq("channel", "telegram")
    .eq("external_request_id", input.externalRequestId)
    .maybeSingle();
  const attemptCount = Math.min(20, Number(previous?.attempt_count || 0) + 1);
  const attemptRow = {
    owner_id: input.ownerId,
    conversation_id: input.conversationId,
    message_id: input.messageId,
    channel: "telegram",
    external_request_id: input.externalRequestId,
    status: "sending",
    attempt_count: attemptCount,
    error_code: null,
    error_message: null,
    next_retry_at: null,
  };
  const attemptResult = previous?.id
    ? await db.from("assistant_delivery_attempts").update(attemptRow).eq("id", previous.id).select("id").single()
    : await db.from("assistant_delivery_attempts").insert(attemptRow).select("id").single();
  if (attemptResult.error || !attemptResult.data) {
    throw new Error(`Telegram 전송 기록 생성 실패: ${attemptResult.error?.message || "unknown"}`);
  }

  try {
    await input.send();
    const deliveredAt = new Date().toISOString();
    await updateAssistantMessageDelivery(db, { ...input, deliveryStatus: "delivered" });
    const { error: attemptUpdateError } = await db
      .from("assistant_delivery_attempts")
      .update({ status: "delivered", delivered_at: deliveredAt, sent_at: deliveredAt })
      .eq("id", attemptResult.data.id);
    if (attemptUpdateError) throw new Error(`Telegram 전송 완료 기록 실패: ${attemptUpdateError.message}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Telegram 전송 실패";
    await Promise.allSettled([
      updateAssistantMessageDelivery(db, { ...input, deliveryStatus: "failed" }),
      db.from("assistant_delivery_attempts").update({ status: "failed", error_code: "telegram_delivery_failed", error_message: message.slice(0, 2000) }).eq("id", attemptResult.data.id),
    ]);
    throw error;
  }
}
