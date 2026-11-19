import { createHash } from "node:crypto";
import { isIP } from "node:net";
import type { NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabase";
import { enforcePublicSelectionRateLimit, publicRequestIp } from "@/lib/select-gallery/publicSelectionServer";
import {
  effectiveBillingConsentStatus,
} from "./status";
import {
  hashBillingConsentToken,
  verifyBillingConsentSession,
} from "./security";
import type {
  BillingConsentSessionPayload,
  BillingConsentStatus,
  BillingConsentVerificationChannel,
} from "./types";

export const BILLING_CONSENT_SESSION_COOKIE = "billing_consent_session";
export const BILLING_CONSENT_BUCKET = "billing-consents";

export const BILLING_CONSENT_SELECT = [
  "id",
  "document_id",
  "customer_id",
  "contract_id",
  "quote_id",
  "workflow_run_id",
  "supersedes_id",
  "version",
  "customer_snapshot",
  "issuer_snapshot",
  "contract_snapshot",
  "items",
  "subtotal",
  "vat",
  "total",
  "reason",
  "evidence",
  "bank_info",
  "due_date",
  "status",
  "token_hash",
  "expires_at",
  "sent_at",
  "last_viewed_at",
  "verification_channel",
  "verification_target_hash",
  "verification_target_masked",
  "auth_cookie_version",
  "signer_name",
  "consent_checks",
  "signed_at",
  "signed_ip",
  "signed_ua",
  "signature_path",
  "signature_sha256",
  "document_evidence_sha256",
  "pdf_path",
  "pdf_sha256",
  "pdf_generated_at",
  "objection_reason",
  "disputed_at",
  "canceled_at",
  "payment_confirmed_at",
  "created_at",
  "updated_at",
].join(",");

export type BillingConsentRow = {
  id: string;
  document_id: string;
  customer_id: string;
  contract_id: string | null;
  quote_id: string | null;
  workflow_run_id: string | null;
  supersedes_id: string | null;
  version: number;
  customer_snapshot: Record<string, unknown>;
  issuer_snapshot: Record<string, unknown>;
  contract_snapshot: Record<string, unknown> | null;
  items: Array<Record<string, unknown>>;
  subtotal: number | string;
  vat: number | string;
  total: number | string;
  reason: string;
  evidence: Array<Record<string, unknown>>;
  bank_info: string;
  due_date: string | null;
  status: BillingConsentStatus;
  token_hash: string | null;
  expires_at: string | null;
  sent_at: string | null;
  last_viewed_at: string | null;
  verification_channel: BillingConsentVerificationChannel;
  verification_target_hash: string | null;
  verification_target_masked: string | null;
  auth_cookie_version: number;
  signer_name: string | null;
  consent_checks: Record<string, unknown> | null;
  signed_at: string | null;
  signed_ip: string | null;
  signed_ua: string | null;
  signature_path: string | null;
  signature_sha256: string | null;
  document_evidence_sha256: string | null;
  pdf_path: string | null;
  pdf_sha256: string | null;
  pdf_generated_at: string | null;
  objection_reason: string | null;
  disputed_at: string | null;
  canceled_at: string | null;
  payment_confirmed_at: string | null;
  created_at: string;
  updated_at: string;
};

export class BillingConsentRequestError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
    this.name = "BillingConsentRequestError";
  }
}

export function cleanBillingConsentText(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

export function billingConsentSecret() {
  const source = process.env.BILLING_CONSENT_SESSION_SECRET
    || process.env.PERSON_SELECT_SESSION_SECRET
    || process.env.INTERNAL_API_KEY;
  if (!source) throw new Error("BILLING_CONSENT_SESSION_SECRET가 설정되지 않았습니다.");
  return createHash("sha256").update(`olivia-billing-consent\n${source}`).digest("hex");
}

export function billingConsentBaseUrl(request: Request) {
  const configured = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL;
  if (configured) return configured.replace(/\/$/, "");
  return new URL(request.url).origin;
}

export function billingConsentRequestContext(request: Request) {
  const candidate = publicRequestIp(request);
  return {
    ip: candidate && isIP(candidate) ? candidate : null,
    ua: cleanBillingConsentText(request.headers.get("user-agent"), 500) || null,
  };
}

export async function recordBillingConsentEvent(input: {
  db?: SupabaseClient;
  consentId: string;
  type: string;
  request?: Request;
  meta?: Record<string, unknown>;
}) {
  const db = input.db ?? getSupabaseAdmin();
  const context = input.request ? billingConsentRequestContext(input.request) : { ip: null, ua: null };
  const { error } = await db.from("billing_consent_events").insert({
    consent_id: input.consentId,
    type: input.type,
    ip: context.ip,
    ua: context.ua,
    meta: input.meta ?? {},
  });
  if (error) throw new Error(error.message);
}

export async function loadBillingConsentById(id: string, db = getSupabaseAdmin()) {
  const { data, error } = await db
    .from("billing_consents")
    .select(BILLING_CONSENT_SELECT)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as unknown as BillingConsentRow | null;
}

export async function loadBillingConsentByToken(token: string, db = getSupabaseAdmin()) {
  if (!token || token.length < 32 || token.length > 256) {
    throw new BillingConsentRequestError("유효하지 않은 링크입니다.", 404);
  }
  const { data, error } = await db
    .from("billing_consents")
    .select(BILLING_CONSENT_SELECT)
    .eq("token_hash", hashBillingConsentToken(token))
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new BillingConsentRequestError("유효하지 않은 링크입니다.", 404);
  const consent = data as unknown as BillingConsentRow;
  const status = effectiveBillingConsentStatus({ status: consent.status, expiresAt: consent.expires_at });
  if (status === "expired") throw new BillingConsentRequestError("만료된 청구 동의서입니다.", 410);
  if (status === "canceled") throw new BillingConsentRequestError("취소된 청구 동의서입니다.", 410);
  return { db, consent, status };
}

export function getBillingConsentSession(request: NextRequest, consent: BillingConsentRow): BillingConsentSessionPayload | null {
  return verifyBillingConsentSession({
    value: request.cookies.get(BILLING_CONSENT_SESSION_COOKIE)?.value,
    consentId: consent.id,
    cookieVersion: consent.auth_cookie_version,
    secret: billingConsentSecret(),
  });
}

export function requireBillingConsentSession(request: NextRequest, consent: BillingConsentRow) {
  const session = getBillingConsentSession(request, consent);
  if (!session) throw new BillingConsentRequestError("본인 확인이 필요합니다.", 401);
  return session;
}

export async function enforceBillingConsentRateLimit(input: {
  db: SupabaseClient;
  request: Request;
  token: string;
  action: string;
  limit: number;
  windowSeconds?: number;
}) {
  try {
    await enforcePublicSelectionRateLimit({
      db: input.db,
      request: input.request,
      token: input.token,
      action: `billing-consent:${input.action}`,
      limit: input.limit,
      windowSeconds: input.windowSeconds,
    });
  } catch (error) {
    if (error instanceof Error && /요청이 너무 많습니다/.test(error.message)) {
      throw new BillingConsentRequestError(error.message, 429);
    }
    throw error;
  }
}

export function billingConsentErrorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : "요청을 처리하지 못했습니다.";
  const status = error instanceof BillingConsentRequestError ? error.status : 500;
  return Response.json({ ok: false, error: message }, { status });
}
