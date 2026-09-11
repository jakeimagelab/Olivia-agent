import { createHmac, timingSafeEqual } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getTemporaryDocument } from "./temporaryDocuments";

export const TEMPORARY_DOCUMENT_SHARE_DAYS = 7;

function previewUrl(baseUrl: string, token: string) {
  return `${baseUrl.replace(/\/$/, "")}/document-preview/m/${token}`;
}

function signingKey() {
  const key = process.env.TEMPORARY_DOCUMENT_SHARE_SECRET
    || process.env.INTERNAL_API_KEY
    || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("미리보기 링크 서명 키가 없습니다.");
  return key;
}

function signature(payload: string) {
  return createHmac("sha256", signingKey()).update(payload).digest("base64url");
}

export function verifyTemporaryDocumentShareToken(token: string) {
  const [payload, provided] = token.split(".");
  if (!payload || !provided) return null;
  const expected = signature(payload);
  const left = Buffer.from(provided);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !timingSafeEqual(left, right)) return null;
  try {
    const value = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { d?: unknown; e?: unknown };
    if (typeof value.d !== "string" || typeof value.e !== "number" || value.e <= Date.now()) return null;
    return { temporaryDocumentId: value.d, expiresAt: new Date(value.e).toISOString() };
  } catch {
    return null;
  }
}

export function createTemporaryDocumentShareToken(temporaryDocumentId: string, nowMs = Date.now()) {
  const expiresAtMs = nowMs + TEMPORARY_DOCUMENT_SHARE_DAYS * 86_400_000;
  const payload = Buffer.from(JSON.stringify({ d: temporaryDocumentId, e: expiresAtMs }), "utf8").toString("base64url");
  return { token: `${payload}.${signature(payload)}`, expiresAt: new Date(expiresAtMs).toISOString() };
}

export async function createTemporaryDocumentShare(db: SupabaseClient, temporaryDocumentId: string, baseUrl: string) {
  await getTemporaryDocument(db, temporaryDocumentId);
  const { token, expiresAt } = createTemporaryDocumentShareToken(temporaryDocumentId);
  return { token, expiresAt, url: previewUrl(baseUrl, token) };
}
