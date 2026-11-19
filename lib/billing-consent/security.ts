import {
  createHash,
  createHmac,
  randomBytes,
  randomInt,
  timingSafeEqual,
} from "node:crypto";
import type {
  BillingConsentSessionPayload,
  BillingConsentVerificationChannel,
} from "./types";

const OTP_MAX_ATTEMPTS = 5;
const OTP_LOCK_MS = 15 * 60 * 1_000;
const OTP_TTL_MS = 5 * 60 * 1_000;
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1_000;

function safeEqual(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function sha256Hex(value: string | Buffer | Uint8Array) {
  return createHash("sha256").update(value).digest("hex");
}

export function verifySha256(value: string | Buffer | Uint8Array, expected: string) {
  return safeEqual(sha256Hex(value), expected.toLowerCase());
}

export function generateBillingConsentToken() {
  return randomBytes(32).toString("base64url");
}

export function hashBillingConsentToken(token: string) {
  return sha256Hex(token);
}

export function generateBillingConsentDocumentId(now = new Date()) {
  const date = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now).replaceAll("-", "");
  return `BC-${date}-${randomBytes(6).toString("hex").toUpperCase()}`;
}

export function generateBillingConsentOtp() {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

export function billingConsentOtpExpiry(now = Date.now()) {
  return new Date(now + OTP_TTL_MS);
}

export function hashBillingConsentOtp(input: {
  consentId: string;
  challengeId: string;
  code: string;
  secret: string;
}) {
  return createHmac("sha256", input.secret)
    .update(`${input.consentId}\n${input.challengeId}\n${input.code}`)
    .digest("hex");
}

export function verifyBillingConsentOtp(input: {
  consentId: string;
  challengeId: string;
  code: string;
  codeHash: string;
  secret: string;
}) {
  return safeEqual(hashBillingConsentOtp(input), input.codeHash);
}

export function nextBillingConsentOtpFailure(
  attempts: number,
  now = new Date(),
) {
  const nextAttempts = Math.max(0, Math.trunc(attempts)) + 1;
  return {
    attempts: nextAttempts,
    lockedUntil: nextAttempts >= OTP_MAX_ATTEMPTS
      ? new Date(now.getTime() + OTP_LOCK_MS).toISOString()
      : null,
  };
}

export function isBillingConsentOtpLocked(lockedUntil: string | null | undefined, now = new Date()) {
  if (!lockedUntil) return false;
  const timestamp = new Date(lockedUntil).getTime();
  return Number.isFinite(timestamp) && timestamp > now.getTime();
}

export function normalizeBillingConsentTarget(
  channel: BillingConsentVerificationChannel,
  value: string,
) {
  const trimmed = value.trim();
  if (channel === "email") return trimmed.toLowerCase();
  return trimmed.replace(/\D/g, "");
}

export function maskBillingConsentTarget(
  channel: BillingConsentVerificationChannel,
  value: string,
) {
  const normalized = normalizeBillingConsentTarget(channel, value);
  if (channel === "email") {
    const [local = "", domain = ""] = normalized.split("@");
    if (!domain) return "***";
    const visible = local.slice(0, Math.min(2, local.length));
    return `${visible}${"*".repeat(Math.max(3, local.length - visible.length))}@${domain}`;
  }
  if (normalized.length < 7) return "***";
  return `${normalized.slice(0, 3)}-${"*".repeat(Math.max(3, normalized.length - 7))}-${normalized.slice(-4)}`;
}

export function hashBillingConsentTarget(
  channel: BillingConsentVerificationChannel,
  value: string,
  secret: string,
) {
  return createHmac("sha256", secret)
    .update(`${channel}\n${normalizeBillingConsentTarget(channel, value)}`)
    .digest("hex");
}

export function createBillingConsentSession(input: {
  consentId: string;
  channel: BillingConsentVerificationChannel;
  cookieVersion: number;
  secret: string;
  now?: number;
}) {
  const payload: BillingConsentSessionPayload = {
    consentId: input.consentId,
    channel: input.channel,
    cookieVersion: input.cookieVersion,
    expiresAt: (input.now ?? Date.now()) + SESSION_TTL_MS,
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = createHmac("sha256", input.secret).update(encoded).digest("base64url");
  return `${encoded}.${signature}`;
}

export function verifyBillingConsentSession(input: {
  value: string | null | undefined;
  consentId: string;
  cookieVersion: number;
  secret: string;
  now?: number;
}): BillingConsentSessionPayload | null {
  if (!input.value) return null;
  const [encoded, signature, extra] = input.value.split(".");
  if (!encoded || !signature || extra) return null;
  const expected = createHmac("sha256", input.secret).update(encoded).digest("base64url");
  if (!safeEqual(signature, expected)) return null;
  try {
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as BillingConsentSessionPayload;
    if (payload.consentId !== input.consentId) return null;
    if (payload.cookieVersion !== input.cookieVersion) return null;
    if (!Number.isFinite(payload.expiresAt) || payload.expiresAt <= (input.now ?? Date.now())) return null;
    if (payload.channel !== "email" && payload.channel !== "sms") return null;
    return payload;
  } catch {
    return null;
  }
}
