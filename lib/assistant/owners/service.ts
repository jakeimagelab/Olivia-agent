import { randomInt } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  encryptAssistantSecret,
  hashAssistantSecret,
} from "@/lib/assistant/security";

const PRIMARY_OWNER_KEY = "primary_owner";
const LINK_CODE_TTL_MS = 10 * 60 * 1000;

export type AssistantOwner = {
  id: string;
  owner_key: string;
  email: string | null;
  display_name: string;
  role: "OWNER";
  status: "active" | "disabled";
};

export type KakaoExternalIdentity = {
  botUserKey: string;
  plusfriendUserKey?: string;
  appUserId?: string;
};

function createNumericLinkCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

export async function ensurePrimaryAssistantOwner(
  db: SupabaseClient,
): Promise<AssistantOwner> {
  const email = process.env.ASSISTANT_OWNER_EMAIL?.trim() || null;
  const displayName =
    process.env.ASSISTANT_OWNER_DISPLAY_NAME?.trim() || "대표자";
  const { data, error } = await db
    .from("assistant_owners")
    .upsert(
      {
        owner_key: PRIMARY_OWNER_KEY,
        email,
        display_name: displayName,
        role: "OWNER",
        status: "active",
      },
      { onConflict: "owner_key" },
    )
    .select("id,owner_key,email,display_name,role,status")
    .single();
  if (error) throw new Error(`대표자 프로필 준비 실패: ${error.message}`);
  return data as AssistantOwner;
}

export async function issueKakaoLinkCode(
  db: SupabaseClient,
  ownerId: string,
): Promise<{ code: string; expiresAt: string }> {
  const code = createNumericLinkCode();
  const codeHash = hashAssistantSecret(`kakao:${code}`);
  const expiresAt = new Date(Date.now() + LINK_CODE_TTL_MS).toISOString();

  await db
    .from("assistant_link_codes")
    .update({ status: "expired" })
    .eq("owner_id", ownerId)
    .eq("channel", "kakao")
    .eq("status", "active");

  const { error } = await db.from("assistant_link_codes").insert({
    owner_id: ownerId,
    channel: "kakao",
    code_hash: codeHash,
    status: "active",
    expires_at: expiresAt,
  });
  if (error) throw new Error(`카카오 연결 코드 생성 실패: ${error.message}`);
  return { code, expiresAt };
}

export async function connectKakaoOwnerWithCode(
  db: SupabaseClient,
  code: string,
  identity: KakaoExternalIdentity,
): Promise<AssistantOwner | null> {
  const codeHash = hashAssistantSecret(`kakao:${code}`);
  const { data: linkCode, error: codeError } = await db
    .from("assistant_link_codes")
    .select("id,owner_id,attempt_count,max_attempts,expires_at,status")
    .eq("code_hash", codeHash)
    .maybeSingle();
  if (codeError) throw new Error(`카카오 연결 코드 확인 실패: ${codeError.message}`);
  if (!linkCode || linkCode.status !== "active") return null;

  const expired = new Date(linkCode.expires_at).getTime() <= Date.now();
  if (expired || linkCode.attempt_count >= linkCode.max_attempts) {
    await db
      .from("assistant_link_codes")
      .update({ status: expired ? "expired" : "locked" })
      .eq("id", linkCode.id)
      .eq("status", "active");
    return null;
  }

  const externalUserIdHash = hashAssistantSecret(
    `kakao:bot:${identity.botUserKey}`,
  );
  const connection = {
    owner_id: linkCode.owner_id,
    channel: "kakao",
    status: "active",
    external_user_id_hash: externalUserIdHash,
    external_user_id_encrypted: encryptAssistantSecret(identity.botUserKey),
    channel_user_key_hash: identity.plusfriendUserKey
      ? hashAssistantSecret(`kakao:channel:${identity.plusfriendUserKey}`)
      : null,
    channel_user_key_encrypted: identity.plusfriendUserKey
      ? encryptAssistantSecret(identity.plusfriendUserKey)
      : null,
    app_user_id_hash: identity.appUserId
      ? hashAssistantSecret(`kakao:app:${identity.appUserId}`)
      : null,
    app_user_id_encrypted: identity.appUserId
      ? encryptAssistantSecret(identity.appUserId)
      : null,
    disconnected_at: null,
    connected_at: new Date().toISOString(),
    last_received_at: new Date().toISOString(),
  };

  await db
    .from("assistant_channel_connections")
    .update({ status: "disconnected", disconnected_at: new Date().toISOString() })
    .eq("owner_id", linkCode.owner_id)
    .eq("channel", "kakao")
    .eq("status", "active");

  const { error: connectionError } = await db
    .from("assistant_channel_connections")
    .upsert(connection, { onConflict: "channel,external_user_id_hash" });
  if (connectionError) {
    throw new Error(`카카오 대표자 연결 실패: ${connectionError.message}`);
  }

  const { data: consumed } = await db
    .from("assistant_link_codes")
    .update({ status: "consumed", consumed_at: new Date().toISOString() })
    .eq("id", linkCode.id)
    .eq("status", "active")
    .select("owner_id")
    .maybeSingle();
  if (!consumed) return null;

  const { data: owner, error: ownerError } = await db
    .from("assistant_owners")
    .select("id,owner_key,email,display_name,role,status")
    .eq("id", linkCode.owner_id)
    .single();
  if (ownerError) throw new Error(`대표자 프로필 조회 실패: ${ownerError.message}`);
  return owner as AssistantOwner;
}

export async function findKakaoOwner(
  db: SupabaseClient,
  botUserKey: string,
): Promise<AssistantOwner | null> {
  const externalUserIdHash = hashAssistantSecret(`kakao:bot:${botUserKey}`);
  const { data: connection, error } = await db
    .from("assistant_channel_connections")
    .select("owner_id")
    .eq("channel", "kakao")
    .eq("external_user_id_hash", externalUserIdHash)
    .eq("status", "active")
    .maybeSingle();
  if (error) throw new Error(`카카오 연결 확인 실패: ${error.message}`);
  if (!connection) return null;

  const { data: owner, error: ownerError } = await db
    .from("assistant_owners")
    .select("id,owner_key,email,display_name,role,status")
    .eq("id", connection.owner_id)
    .eq("status", "active")
    .maybeSingle();
  if (ownerError) throw new Error(`대표자 확인 실패: ${ownerError.message}`);
  return owner as AssistantOwner | null;
}
