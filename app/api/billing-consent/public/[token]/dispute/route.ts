import { NextRequest, NextResponse } from "next/server";
import { sendBillingConsentDisputeEmail } from "@/lib/billing-consent/email";
import {
  billingConsentErrorResponse,
  cleanBillingConsentText,
  enforceBillingConsentRateLimit,
  loadBillingConsentByToken,
  recordBillingConsentEvent,
  requireBillingConsentSession,
} from "@/lib/billing-consent/server";

export const runtime = "nodejs";

export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;
    const { db, consent, status } = await loadBillingConsentByToken(token);
    requireBillingConsentSession(request, consent);
    await enforceBillingConsentRateLimit({ db, request, token, action: "dispute", limit: 5, windowSeconds: 300 });
    if (status !== "sent" && status !== "viewed") return NextResponse.json({ ok: false, error: "현재 문서에는 이의를 제출할 수 없습니다." }, { status: 409 });
    const body = await request.json() as Record<string, unknown>;
    const reason = cleanBillingConsentText(body.reason, 3_000);
    if (reason.length < 3) return NextResponse.json({ ok: false, error: "이의 사유를 입력해 주세요." }, { status: 400 });
    const disputedAt = new Date().toISOString();
    const { data, error } = await db.from("billing_consents").update({ status: "disputed", objection_reason: reason, disputed_at: disputedAt }).eq("id", consent.id).in("status", ["sent", "viewed"]).select("id").maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return NextResponse.json({ ok: false, error: "다른 요청에서 문서 상태가 변경되었습니다." }, { status: 409 });
    await recordBillingConsentEvent({ db, consentId: consent.id, type: "disputed", request, meta: { reason } });
    try {
      await sendBillingConsentDisputeEmail({ documentId: consent.document_id, customerName: String(consent.customer_snapshot?.name || "고객"), reason });
    } catch (mailError) {
      await recordBillingConsentEvent({ db, consentId: consent.id, type: "email_failed", request, meta: { kind: "dispute", reason: String(mailError).slice(0, 300) } });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    return billingConsentErrorResponse(error);
  }
}
