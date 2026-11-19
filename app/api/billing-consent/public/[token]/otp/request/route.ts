import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { sendBillingConsentOtpEmail } from "@/lib/billing-consent/email";
import {
  billingConsentErrorResponse,
  billingConsentSecret,
  cleanBillingConsentText,
  enforceBillingConsentRateLimit,
  loadBillingConsentByToken,
  recordBillingConsentEvent,
} from "@/lib/billing-consent/server";
import {
  billingConsentOtpExpiry,
  billingConsentSecureEqual,
  generateBillingConsentOtp,
  hashBillingConsentOtp,
  hashBillingConsentTarget,
} from "@/lib/billing-consent/security";

export const runtime = "nodejs";

export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;
    const { db, consent } = await loadBillingConsentByToken(token);
    await enforceBillingConsentRateLimit({ db, request, token, action: "otp-request", limit: 5, windowSeconds: 300 });
    const body = await request.json() as Record<string, unknown>;
    const target = cleanBillingConsentText(body.target, 320);
    const targetHash = hashBillingConsentTarget(consent.verification_channel, target, billingConsentSecret());
    if (!consent.verification_target_hash || !billingConsentSecureEqual(targetHash, consent.verification_target_hash)) {
      await recordBillingConsentEvent({ db, consentId: consent.id, type: "otp_failed", request, meta: { reason: "target_mismatch" } });
      return NextResponse.json({ ok: false, error: "입력한 본인 확인 정보가 일치하지 않습니다." }, { status: 400 });
    }
    if (consent.verification_channel !== "email") {
      return NextResponse.json({ ok: false, error: "SMS 인증은 아직 설정되지 않았습니다." }, { status: 503 });
    }
    const challengeId = randomUUID();
    const code = generateBillingConsentOtp();
    const expiresAt = billingConsentOtpExpiry();
    const { error: invalidateError } = await db.from("billing_consent_auth_challenges").update({ invalidated_at: new Date().toISOString() }).eq("consent_id", consent.id).is("verified_at", null).is("invalidated_at", null);
    if (invalidateError) throw new Error(invalidateError.message);
    const { error: insertError } = await db.from("billing_consent_auth_challenges").insert({
      id: challengeId,
      consent_id: consent.id,
      channel: consent.verification_channel,
      target_hash: targetHash,
      code_hash: hashBillingConsentOtp({ consentId: consent.id, challengeId, code, secret: billingConsentSecret() }),
      expires_at: expiresAt.toISOString(),
    });
    if (insertError) throw new Error(insertError.message);
    try {
      await sendBillingConsentOtpEmail({
        to: target,
        customerName: String(consent.customer_snapshot?.name || "고객"),
        code,
      });
    } catch (error) {
      await db.from("billing_consent_auth_challenges").update({ invalidated_at: new Date().toISOString() }).eq("id", challengeId);
      const reason = error instanceof Error ? error.message : "이메일 발송 실패";
      await recordBillingConsentEvent({ db, consentId: consent.id, type: "email_failed", request, meta: { kind: "otp", reason: reason.slice(0, 300) } });
      throw error;
    }
    await recordBillingConsentEvent({ db, consentId: consent.id, type: "otp_requested", request, meta: { channel: consent.verification_channel } });
    return NextResponse.json({ ok: true, expiresAt: expiresAt.toISOString() });
  } catch (error) {
    return billingConsentErrorResponse(error);
  }
}
