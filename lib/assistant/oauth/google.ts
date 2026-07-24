import type { SupabaseClient } from "@supabase/supabase-js";
import {
  decryptAssistantSecret,
  encryptAssistantSecret,
} from "@/lib/assistant/security";

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GMAIL_API = "https://gmail.googleapis.com/gmail/v1/users/me";
const FETCH_TIMEOUT_MS = 12_000;

type StoredGoogleCredential = {
  id: string;
  encrypted_refresh_token: string;
  encrypted_access_token: string | null;
  access_token_expires_at: string | null;
  scopes: string[] | null;
  status: string;
};

function timedSignal() {
  return AbortSignal.timeout(FETCH_TIMEOUT_MS);
}

function decodeBase64Url(value: string): string {
  return Buffer.from(value, "base64url").toString("utf8");
}

function htmlToText(value: string): string {
  return value
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function findBodyPart(part: any, mimeType: string): string | null {
  if (part?.mimeType === mimeType && part.body?.data) {
    return decodeBase64Url(part.body.data);
  }
  for (const child of part?.parts ?? []) {
    const found = findBodyPart(child, mimeType);
    if (found) return found;
  }
  return null;
}

function headerValue(headers: any[], name: string): string {
  return String(
    headers?.find(
      (header) => String(header.name).toLowerCase() === name.toLowerCase(),
    )?.value || "",
  );
}

async function getGoogleCredential(
  db: SupabaseClient,
  ownerId: string,
): Promise<StoredGoogleCredential> {
  const { data, error } = await db
    .from("assistant_oauth_credentials")
    .select(
      "id,encrypted_refresh_token,encrypted_access_token,access_token_expires_at,scopes,status",
    )
    .eq("owner_id", ownerId)
    .eq("provider", "google")
    .eq("status", "active")
    .maybeSingle();
  if (error) throw new Error(`Google 연결 조회 실패: ${error.message}`);
  if (!data) {
    throw new Error("Google 메일 계정이 연결되지 않았습니다.");
  }
  return data as StoredGoogleCredential;
}

export async function getGoogleAccessToken(
  db: SupabaseClient,
  ownerId: string,
): Promise<string> {
  const credential = await getGoogleCredential(db, ownerId);
  if (
    credential.encrypted_access_token &&
    credential.access_token_expires_at &&
    new Date(credential.access_token_expires_at).getTime() > Date.now() + 60_000
  ) {
    return decryptAssistantSecret(credential.encrypted_access_token);
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("Google OAuth 환경변수가 설정되지 않았습니다.");
  }
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: decryptAssistantSecret(
        credential.encrypted_refresh_token,
      ),
      grant_type: "refresh_token",
    }),
    signal: timedSignal(),
    cache: "no-store",
  });
  const token = await response.json();
  if (!response.ok || !token.access_token) {
    throw new Error("Google 인증을 갱신하지 못했습니다. 다시 연결해 주세요.");
  }
  const expiresAt = new Date(
    Date.now() + Number(token.expires_in || 3600) * 1_000,
  ).toISOString();
  await db
    .from("assistant_oauth_credentials")
    .update({
      encrypted_access_token: encryptAssistantSecret(token.access_token),
      access_token_expires_at: expiresAt,
      last_refreshed_at: new Date().toISOString(),
    })
    .eq("id", credential.id);
  return token.access_token;
}

async function gmailFetch(
  db: SupabaseClient,
  ownerId: string,
  path: string,
  init?: RequestInit,
) {
  const accessToken = await getGoogleAccessToken(db, ownerId);
  const response = await fetch(`${GMAIL_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...(init?.headers ?? {}),
    },
    signal: timedSignal(),
    cache: "no-store",
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error("Gmail 요청을 처리하지 못했습니다.");
  }
  return data;
}

export async function searchAssistantGmail(
  db: SupabaseClient,
  ownerId: string,
  query: string,
  limit = 10,
) {
  const params = new URLSearchParams({
    q: query,
    maxResults: String(Math.min(Math.max(limit, 1), 20)),
  });
  const list = await gmailFetch(db, ownerId, `/messages?${params}`);
  const ids = (list.messages ?? []).map((message: any) => String(message.id));
  const messages = await Promise.all(
    ids.map(async (id: string) => {
      const params = new URLSearchParams({
        format: "metadata",
        metadataHeaders: "Subject",
      });
      params.append("metadataHeaders", "From");
      params.append("metadataHeaders", "Date");
      const message = await gmailFetch(
        db,
        ownerId,
        `/messages/${encodeURIComponent(id)}?${params}`,
      );
      const headers = message.payload?.headers ?? [];
      return {
        id,
        threadId: String(message.threadId || ""),
        subject: headerValue(headers, "Subject") || "(제목 없음)",
        from: headerValue(headers, "From"),
        date: headerValue(headers, "Date"),
        snippet: String(message.snippet || ""),
        labels: Array.isArray(message.labelIds) ? message.labelIds : [],
      };
    }),
  );
  return messages;
}

export async function readAssistantGmail(
  db: SupabaseClient,
  ownerId: string,
  messageId: string,
) {
  const message = await gmailFetch(
    db,
    ownerId,
    `/messages/${encodeURIComponent(messageId)}?format=full`,
  );
  const headers = message.payload?.headers ?? [];
  const plain = findBodyPart(message.payload, "text/plain");
  const html = plain ? null : findBodyPart(message.payload, "text/html");
  const fallback =
    message.payload?.body?.data
      ? decodeBase64Url(message.payload.body.data)
      : "";
  const content = (plain || (html ? htmlToText(html) : fallback)).slice(
    0,
    50_000,
  );
  return {
    id: String(message.id || messageId),
    threadId: String(message.threadId || ""),
    subject: headerValue(headers, "Subject") || "(제목 없음)",
    from: headerValue(headers, "From"),
    to: headerValue(headers, "To"),
    date: headerValue(headers, "Date"),
    content,
    snippet: String(message.snippet || ""),
    hasAttachments: Boolean(
      (message.payload?.parts ?? []).some(
        (part: any) => part.filename && part.body?.attachmentId,
      ),
    ),
  };
}

export async function createAssistantGmailDraft(
  db: SupabaseClient,
  ownerId: string,
  input: {
    to: string;
    subject: string;
    body: string;
    threadId?: string;
    inReplyTo?: string;
  },
) {
  const headers = [
    `To: ${input.to}`,
    `Subject: ${input.subject}`,
    "Content-Type: text/plain; charset=UTF-8",
    "MIME-Version: 1.0",
    ...(input.inReplyTo
      ? [`In-Reply-To: ${input.inReplyTo}`, `References: ${input.inReplyTo}`]
      : []),
    "",
    input.body,
  ];
  const raw = Buffer.from(headers.join("\r\n"), "utf8").toString("base64url");
  const draft = await gmailFetch(db, ownerId, "/drafts", {
    method: "POST",
    body: JSON.stringify({
      message: {
        raw,
        ...(input.threadId ? { threadId: input.threadId } : {}),
      },
    }),
  });
  return {
    id: String(draft.id || ""),
    messageId: String(draft.message?.id || ""),
    threadId: String(draft.message?.threadId || input.threadId || ""),
  };
}
