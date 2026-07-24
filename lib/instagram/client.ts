import type { SupabaseClient } from "@supabase/supabase-js";
import { decryptInstagramToken } from "./tokenCrypto";

const graphVersion = () => process.env.META_GRAPH_API_VERSION || "v23.0";
const graphBase = () => process.env.META_GRAPH_API_BASE || "https://graph.facebook.com";

export type InstagramCredentials = {
  accountId: string | null;
  igUserId: string;
  username: string;
  accessToken: string;
};

export async function getInstagramCredentials(db: SupabaseClient): Promise<InstagramCredentials | null> {
  const envToken = process.env.INSTAGRAM_ACCESS_TOKEN?.trim();
  const envUserId = process.env.INSTAGRAM_USER_ID?.trim();
  if (envToken && envUserId) {
    const { data: account } = await db.from("instagram_accounts").upsert({
      ig_user_id: envUserId,
      username: process.env.INSTAGRAM_USERNAME || "photoclinic",
      token_ciphertext: "environment",
      token_iv: "environment",
      token_tag: "environment",
      status: "connected",
      connected_by: "owner",
    }, { onConflict: "ig_user_id" }).select("id").single();
    return {
      accountId: account?.id || null,
      igUserId: envUserId,
      username: process.env.INSTAGRAM_USERNAME || "photoclinic",
      accessToken: envToken,
    };
  }

  const { data } = await db.from("instagram_accounts")
    .select("*")
    .eq("status", "connected")
    .order("connected_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data || data.token_ciphertext === "environment") return null;
  return {
    accountId: data.id,
    igUserId: data.ig_user_id,
    username: data.username || "",
    accessToken: decryptInstagramToken({
      ciphertext: data.token_ciphertext,
      iv: data.token_iv,
      tag: data.token_tag,
    }),
  };
}

async function graphRequest<T>(path: string, accessToken: string, init?: RequestInit): Promise<T> {
  const separator = path.includes("?") ? "&" : "?";
  const response = await fetch(`${graphBase()}/${graphVersion()}/${path}${separator}access_token=${encodeURIComponent(accessToken)}`, {
    ...init,
    signal: AbortSignal.timeout(30_000),
  });
  const data = await response.json();
  if (!response.ok || data.error) throw new Error(data.error?.message || "Instagram API 요청에 실패했습니다.");
  return data as T;
}

export async function verifyInstagramAccount(credentials: InstagramCredentials) {
  return graphRequest<{ id: string; username?: string }>(
    `${credentials.igUserId}?fields=id,username`,
    credentials.accessToken,
  );
}

export async function publishInstagramImage(input: {
  credentials: InstagramCredentials;
  imageUrl: string;
  caption: string;
}) {
  const body = new URLSearchParams({
    image_url: input.imageUrl,
    caption: input.caption,
  });
  const container = await graphRequest<{ id: string }>(
    `${input.credentials.igUserId}/media`,
    input.credentials.accessToken,
    { method: "POST", body },
  );

  let isReady = false;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const status = await graphRequest<{ status_code?: string; status?: string }>(
      `${container.id}?fields=status_code,status`,
      input.credentials.accessToken,
    );
    if (status.status_code === "FINISHED") {
      isReady = true;
      break;
    }
    if (status.status_code === "ERROR" || status.status_code === "EXPIRED") {
      throw new Error(status.status || "Instagram 미디어 처리에 실패했습니다.");
    }
    await new Promise((resolve) => setTimeout(resolve, 1_500));
  }
  if (!isReady) throw new Error("Instagram 이미지 처리가 지연되고 있습니다. 잠시 후 다시 시도해주세요.");

  const publishBody = new URLSearchParams({ creation_id: container.id });
  const published = await graphRequest<{ id: string }>(
    `${input.credentials.igUserId}/media_publish`,
    input.credentials.accessToken,
    { method: "POST", body: publishBody },
  );
  return { creationId: container.id, mediaId: published.id };
}
