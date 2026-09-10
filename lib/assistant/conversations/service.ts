import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  AssistantChannel,
  AssistantMessageRole,
} from "@/lib/assistant/types";
import {
  OLIVIA_ATTACHMENT_BUCKET,
  sanitizeOliviaAttachments,
} from "@/lib/olivia/chatAttachments";

export async function getOrCreateAssistantConversation(
  db: SupabaseClient,
  ownerId: string,
): Promise<{ id: string; owner_id: string }> {
  const { data: existing, error: selectError } = await db
    .from("assistant_conversations")
    .select("id,owner_id")
    .eq("owner_id", ownerId)
    .eq("status", "active")
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (selectError) throw new Error(`대화 조회 실패: ${selectError.message}`);
  if (existing) return existing as { id: string; owner_id: string };

  const { data, error } = await db
    .from("assistant_conversations")
    .insert({ owner_id: ownerId, status: "active" })
    .select("id,owner_id")
    .single();
  if (error?.code === "23505") {
    const { data: concurrent, error: concurrentError } = await db
      .from("assistant_conversations")
      .select("id,owner_id")
      .eq("owner_id", ownerId)
      .eq("status", "active")
      .order("last_message_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })
      .limit(1)
      .single();
    if (concurrentError) throw new Error(`동시 생성된 대화 조회 실패: ${concurrentError.message}`);
    return concurrent as { id: string; owner_id: string };
  }
  if (error) throw new Error(`대화 생성 실패: ${error.message}`);
  return data as { id: string; owner_id: string };
}

export type SaveMessageInput = {
  ownerId: string;
  conversationId: string;
  role: AssistantMessageRole;
  content: string;
  channel: AssistantChannel;
  externalMessageId?: string;
  parentMessageId?: string;
  metadata?: Record<string, unknown>;
  deliveryStatus?: "queued" | "sent" | "accepted" | "delivered" | "failed";
};

const MESSAGE_SELECT = "id,created_at,role,content,source,channel,external_message_id,parent_message_id,delivery_status,metadata";

export async function saveAssistantMessage(
  db: SupabaseClient,
  input: SaveMessageInput,
) {
  const role = input.role === "system" ? "assistant" : input.role;
  const row = {
    owner_id: input.ownerId,
    conversation_id: input.conversationId,
    role,
    content: input.content,
    source: input.channel,
    channel: input.channel,
    external_message_id: input.externalMessageId ?? null,
    parent_message_id: input.parentMessageId ?? null,
    delivery_status: input.deliveryStatus ?? null,
    metadata: {
      ...(input.metadata ?? {}),
      ...(input.role === "system" ? { messageType: "system" } : {}),
    },
  };

  const { data, error } = await db
    .from("olivia_chat_messages")
    .insert(row)
    .select(MESSAGE_SELECT)
    .single();
  if (error?.code === "23505" && input.externalMessageId) {
    const { data: existing, error: existingError } = await db
      .from("olivia_chat_messages")
      .select(MESSAGE_SELECT)
      .eq("channel", input.channel)
      .eq("external_message_id", input.externalMessageId)
      .single();
    if (existingError) throw new Error(`중복 대화 조회 실패: ${existingError.message}`);
    return { message: existing, duplicate: true };
  }
  if (error) throw new Error(`대화 저장 실패: ${error.message}`);

  await db
    .from("assistant_conversations")
    .update({ last_message_at: data.created_at })
    .eq("id", input.conversationId)
    .eq("owner_id", input.ownerId);
  return { message: data, duplicate: false };
}

export async function listAssistantMessages(
  db: SupabaseClient,
  ownerId: string,
  conversationId: string,
  limit = 50,
) {
  const safeLimit = Math.min(Math.max(limit, 1), 200);
  const { data, error } = await db
    .from("olivia_chat_messages")
    .select(MESSAGE_SELECT)
    .eq("owner_id", ownerId)
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(safeLimit);
  if (error) throw new Error(`대화 목록 조회 실패: ${error.message}`);
  return (data ?? []).reverse();
}

export async function findAssistantMessageByExternalId(
  db: SupabaseClient,
  input: { ownerId: string; conversationId: string; channel: AssistantChannel; externalMessageId: string },
) {
  const { data, error } = await db
    .from("olivia_chat_messages")
    .select(MESSAGE_SELECT)
    .eq("owner_id", input.ownerId)
    .eq("conversation_id", input.conversationId)
    .eq("channel", input.channel)
    .eq("external_message_id", input.externalMessageId)
    .maybeSingle();
  if (error) throw new Error(`대화 메시지 조회 실패: ${error.message}`);
  return data;
}

export async function updateAssistantMessageDelivery(
  db: SupabaseClient,
  input: {
    ownerId: string;
    conversationId: string;
    messageId: string;
    deliveryStatus: "queued" | "sent" | "accepted" | "delivered" | "failed";
    metadata?: Record<string, unknown>;
  },
) {
  const patch: Record<string, unknown> = { delivery_status: input.deliveryStatus };
  if (input.metadata) patch.metadata = input.metadata;
  const { data, error } = await db
    .from("olivia_chat_messages")
    .update(patch)
    .eq("id", input.messageId)
    .eq("owner_id", input.ownerId)
    .eq("conversation_id", input.conversationId)
    .select(MESSAGE_SELECT)
    .single();
  if (error) throw new Error(`메시지 전송 상태 저장 실패: ${error.message}`);
  return data;
}

export async function addSignedAssistantAttachments(
  db: SupabaseClient,
  messages: Array<Record<string, any>>,
) {
  const paths = Array.from(new Set(messages.flatMap((message) =>
    sanitizeOliviaAttachments(message.metadata?.attachments).map((attachment) => attachment.storagePath)
  )));
  if (!paths.length) return messages;
  const { data } = await db.storage.from(OLIVIA_ATTACHMENT_BUCKET).createSignedUrls(paths, 60 * 30);
  const signedByPath = new Map((data ?? []).flatMap((item) =>
    item.signedUrl ? [[item.path, item.signedUrl] as const] : []
  ));
  return messages.map((message) => {
    const attachments = sanitizeOliviaAttachments(message.metadata?.attachments).map((attachment) => ({
      ...attachment,
      ...(signedByPath.get(attachment.storagePath) ? { downloadUrl: signedByPath.get(attachment.storagePath) } : {}),
    }));
    if (!attachments.length) return message;
    return { ...message, metadata: { ...(message.metadata ?? {}), attachments } };
  });
}
