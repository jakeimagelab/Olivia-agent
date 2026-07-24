import { randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { hashAssistantSecret } from "@/lib/assistant/security";

const VOICE_SESSION_TTL_MS = 10 * 60 * 1_000;

export async function issueAssistantVoiceSession(
  db: SupabaseClient,
  input: { ownerId: string; conversationId: string },
) {
  const token = randomBytes(32).toString("base64url");
  const tokenHash = hashAssistantSecret(`voice:${token}`);
  const expiresAt = new Date(Date.now() + VOICE_SESSION_TTL_MS).toISOString();
  const { data, error } = await db
    .from("assistant_voice_sessions")
    .insert({
      owner_id: input.ownerId,
      conversation_id: input.conversationId,
      token_hash: tokenHash,
      status: "active",
      expires_at: expiresAt,
    })
    .select("id,expires_at")
    .single();
  if (error) throw new Error(`음성 입력 준비 실패: ${error.message}`);
  return { id: data.id as string, token, expiresAt: data.expires_at as string };
}

export async function findAssistantVoiceSession(
  db: SupabaseClient,
  token: string,
) {
  const tokenHash = hashAssistantSecret(`voice:${token}`);
  const { data, error } = await db
    .from("assistant_voice_sessions")
    .select("id,owner_id,conversation_id,status,expires_at")
    .eq("token_hash", tokenHash)
    .maybeSingle();
  if (error) throw new Error(`음성 입력 확인 실패: ${error.message}`);
  if (
    !data ||
    data.status !== "active" ||
    new Date(data.expires_at).getTime() <= Date.now()
  ) {
    return null;
  }
  return data;
}

export async function claimAssistantVoiceSession(
  db: SupabaseClient,
  token: string,
) {
  const tokenHash = hashAssistantSecret(`voice:${token}`);
  const { data, error } = await db
    .from("assistant_voice_sessions")
    .update({ status: "processing", consumed_at: new Date().toISOString() })
    .eq("token_hash", tokenHash)
    .eq("status", "active")
    .gt("expires_at", new Date().toISOString())
    .select("id,owner_id,conversation_id,status,expires_at")
    .maybeSingle();
  if (error) throw new Error(`음성 입력 시작 실패: ${error.message}`);
  return data;
}
