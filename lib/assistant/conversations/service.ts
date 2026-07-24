import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  AssistantChannel,
  AssistantMessageRole,
} from "@/lib/assistant/types";

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
  if (error) throw new Error(`대화 생성 실패: ${error.message}`);
  return data as { id: string; owner_id: string };
}

type SaveMessageInput = {
  ownerId: string;
  conversationId: string;
  role: AssistantMessageRole;
  content: string;
  channel: AssistantChannel;
  externalMessageId?: string;
  parentMessageId?: string;
  metadata?: Record<string, unknown>;
};

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
    metadata: {
      ...(input.metadata ?? {}),
      ...(input.role === "system" ? { messageType: "system" } : {}),
    },
  };

  const { data, error } = await db
    .from("olivia_chat_messages")
    .insert(row)
    .select("id,created_at,role,content,source,channel,metadata")
    .single();
  if (error?.code === "23505" && input.externalMessageId) {
    const { data: existing, error: existingError } = await db
      .from("olivia_chat_messages")
      .select("id,created_at,role,content,source,channel,metadata")
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
    .select("id,created_at,role,content,source,channel,metadata,parent_message_id")
    .eq("owner_id", ownerId)
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(safeLimit);
  if (error) throw new Error(`대화 목록 조회 실패: ${error.message}`);
  return (data ?? []).reverse();
}
