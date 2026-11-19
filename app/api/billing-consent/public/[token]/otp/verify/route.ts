import { NextRequest, NextResponse } from "next/server";
import {
  BILLING_CONSENT_SESSION_COOKIE,
  billingConsentErrorResponse,
  billingConsentSecret,
  cleanBillingConsentText,
  enforceBillingConsentRateLimit,
  loadBillingConsentByToken,
  recordBillingConsentEvent,
} from "@/lib/billing-consent/server";
import {
  createBillingConsentSession,
  isBillingConsentOtpLocked,
  nextBillingConsentOtpFailure,
  verifyBillingConsentOtp,
} from "@/lib/billing-consent/security";

export const runtime = "nodejs";

export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;
    const { db, consent } = await loadBillingConsentByToken(token);
    await enforceBillingConsentRateLimit({ db, request, token, action: "otp-verify", limit: 10, windowSeconds: 900 });
    const body = await request.json() as Record<string, unknown>;
    const code = cleanBillingConsentText(body.code, 6);
    if (!/^\d{6}$/.test(code)) return NextResponse.json({ ok: false, error: "인증번호 6자리를 입력해 주세요." }, { status: 400 });
    const { data: challenge, error } = await db.from("billing_consent_auth_challenges")
      .select("id,code_hash,expires_at,attempts,locked_until,verified_at,invalidated_at")
      .eq("consent_id", consent.id)
      .is("invalidated_at", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!challenge || challenge.verified_at) return NextResponse.json({ ok: false, error: "인증번호를 다시 요청해 주세요." }, { status: 400 });
    const now = new Date();
    if (isBillingConsentOtpLocked(challenge.locked_until, now)) {
      return NextResponse.json({ ok: false, error: "인증번호를 여러 번 틀렸습니다. 잠시 후 다시 시도해 주세요.", lockedUntil: challenge.locked_until }, { status: 429 });
    }
    if (new Date(challenge.expires_at).getTime() <= now.getTime()) {
      return NextResponse.json({ ok: false, error: "인증번호가 만료되었습니다. 다시 요청해 주세요." }, { status: 410 });
    }
    const valid = verifyBillingConsentOtp({ consentId: consent.id, challengeId: challenge.id, code, codeHash: challenge.code_hash, secret: billingConsentSecret() });
    if (!valid) {
      const failed = nextBillingConsentOtpFailure(challenge.attempts, now);
      const { error: updateError } = await db.from("billing_consent_auth_challenges").update({ attempts: failed.attempts, locked_until: failed.lockedUntil }).eq("id", challenge.id);
      if (updateError) throw new Error(updateError.message);
      await recordBillingConsentEvent({ db, consentId: consent.id, type: "otp_failed", request, meta: { attempts: failed.attempts } });
      if (failed.lockedUntil) return NextResponse.json({ ok: false, error: "인증번호를 여러 번 틀렸습니다. 15분 후 다시 시도해 주세요.", lockedUntil: failed.lockedUntil }, { status: 429 });
      return NextResponse.json({ ok: false, error: "인증번호가 일치하지 않습니다." }, { status: 400 });
    }
    const verifiedAt = now.toISOString();
    const { error: verifyError } = await db.from("billing_consent_auth_challenges").update({ verified_at: verifiedAt }).eq("id", challenge.id).is("verified_at", null);
    if (verifyError) throw new Error(verifyError.message);
    await recordBillingConsentEvent({ db, consentId: consent.id, type: "otp_verified", request, meta: { channel: consent.verification_channel } });
    const session = createBillingConsentSession({
      consentId: consent.id,
      channel: consent.verification_channel,
      cookieVersion: consent.auth_cookie_version,
      secret: billingConsentSecret(),
    });
    const response = NextResponse.json({ ok: true });
    response.cookies.set(BILLING_CONSENT_SESSION_COOKIE, session, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 30 * 24 * 60 * 60,
    });
    return response;
  } catch (error) {
    return billingConsentErrorResponse(error);
  }
}
