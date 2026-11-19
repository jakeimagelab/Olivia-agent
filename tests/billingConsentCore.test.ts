import { describe, expect, it } from "vitest";
import {
  calculateBillingConsentTotals,
  normalizeBillingConsentItems,
} from "@/lib/billing-consent/calculations";
import {
  billingConsentEvidenceSha256,
  billingConsentPdfMatches,
  billingConsentPdfSha256,
  canonicalBillingConsentJson,
} from "@/lib/billing-consent/evidence";
import {
  billingConsentOtpExpiry,
  createBillingConsentSession,
  hashBillingConsentOtp,
  isBillingConsentOtpLocked,
  maskBillingConsentTarget,
  nextBillingConsentOtpFailure,
  verifyBillingConsentOtp,
  verifyBillingConsentSession,
} from "@/lib/billing-consent/security";
import { canSignBillingConsent, effectiveBillingConsentStatus } from "@/lib/billing-consent/status";

describe("billing consent totals", () => {
  it("calculates line amounts, ten-percent VAT, and total in won", () => {
    expect(calculateBillingConsentTotals([
      { name: "추가 보정", quantity: 3, unitPrice: 33_333 },
      { name: "인화", quantity: 1, unitPrice: 10_000 },
    ])).toEqual({
      items: [
        { name: "추가 보정", quantity: 3, unitPrice: 33_333, amount: 99_999 },
        { name: "인화", quantity: 1, unitPrice: 10_000, amount: 10_000 },
      ],
      subtotal: 109_999,
      vat: 11_000,
      total: 120_999,
    });
  });

  it("rejects empty, fractional, and negative billing inputs", () => {
    expect(() => normalizeBillingConsentItems([])).toThrow("한 개 이상");
    expect(() => normalizeBillingConsentItems([{ name: "항목", quantity: 1.5, unitPrice: 1_000 }])).toThrow("정수");
    expect(() => normalizeBillingConsentItems([{ name: "항목", quantity: 1, unitPrice: -1 }])).toThrow("0 이상");
  });
});

describe("billing consent OTP and sessions", () => {
  const secret = "billing-consent-test-secret";

  it("keeps OTP valid for five minutes and hashes the six digits with context", () => {
    const now = Date.parse("2026-11-19T00:00:00.000Z");
    expect(billingConsentOtpExpiry(now).toISOString()).toBe("2026-11-19T00:05:00.000Z");
    const codeHash = hashBillingConsentOtp({ consentId: "consent-1", challengeId: "challenge-1", code: "042719", secret });
    expect(codeHash).not.toContain("042719");
    expect(verifyBillingConsentOtp({ consentId: "consent-1", challengeId: "challenge-1", code: "042719", codeHash, secret })).toBe(true);
    expect(verifyBillingConsentOtp({ consentId: "consent-1", challengeId: "challenge-1", code: "042718", codeHash, secret })).toBe(false);
  });

  it("locks for fifteen minutes on the fifth failed attempt", () => {
    const now = new Date("2026-11-19T10:00:00.000Z");
    expect(nextBillingConsentOtpFailure(3, now)).toEqual({ attempts: 4, lockedUntil: null });
    const fifth = nextBillingConsentOtpFailure(4, now);
    expect(fifth).toEqual({ attempts: 5, lockedUntil: "2026-11-19T10:15:00.000Z" });
    expect(isBillingConsentOtpLocked(fifth.lockedUntil, new Date("2026-11-19T10:14:59.000Z"))).toBe(true);
    expect(isBillingConsentOtpLocked(fifth.lockedUntil, new Date("2026-11-19T10:15:00.000Z"))).toBe(false);
  });

  it("binds an authenticated cookie to the document and cookie version", () => {
    const now = Date.parse("2026-11-19T00:00:00.000Z");
    const value = createBillingConsentSession({ consentId: "consent-1", channel: "email", cookieVersion: 2, secret, now });
    expect(verifyBillingConsentSession({ value, consentId: "consent-1", cookieVersion: 2, secret, now: now + 1_000 })).toMatchObject({ channel: "email" });
    expect(verifyBillingConsentSession({ value, consentId: "consent-1", cookieVersion: 3, secret, now: now + 1_000 })).toBeNull();
  });

  it("masks email and mobile targets", () => {
    expect(maskBillingConsentTarget("email", "customer@example.com")).toBe("cu******@example.com");
    expect(maskBillingConsentTarget("sms", "010-1234-5678")).toBe("010-****-5678");
  });
});

describe("billing consent evidence", () => {
  it("produces the same evidence hash regardless of object key order", () => {
    expect(canonicalBillingConsentJson({ b: 2, a: { d: 4, c: 3 } })).toBe('{"a":{"c":3,"d":4},"b":2}');
    expect(billingConsentEvidenceSha256({ b: 2, a: 1 })).toBe(billingConsentEvidenceSha256({ a: 1, b: 2 }));
  });

  it("detects matching and changed PDF bytes", () => {
    const pdf = Buffer.from("%PDF-1.7 signed document");
    const hash = billingConsentPdfSha256(pdf);
    expect(billingConsentPdfMatches(pdf, hash)).toBe(true);
    expect(billingConsentPdfMatches(Buffer.from("%PDF-1.7 changed document"), hash)).toBe(false);
  });
});

describe("billing consent public state", () => {
  it("expires open documents but keeps signed documents signed", () => {
    const now = new Date("2026-11-19T10:00:00.000Z");
    expect(effectiveBillingConsentStatus({ status: "sent", expiresAt: "2026-11-19T09:59:59.000Z", now })).toBe("expired");
    expect(canSignBillingConsent({ status: "sent", expiresAt: "2026-11-19T10:00:01.000Z", now })).toBe(true);
    expect(effectiveBillingConsentStatus({ status: "signed", expiresAt: "2026-11-18T00:00:00.000Z", now })).toBe("signed");
  });
});
