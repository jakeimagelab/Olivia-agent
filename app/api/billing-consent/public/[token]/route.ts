import { NextRequest, NextResponse } from "next/server";
import {
  billingConsentErrorResponse,
  enforceBillingConsentRateLimit,
  getBillingConsentSession,
  loadBillingConsentByToken,
  recordBillingConsentEvent,
} from "@/lib/billing-consent/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;
    const { db, consent, status } = await loadBillingConsentByToken(token);
    await enforceBillingConsentRateLimit({ db, request, token, action: "open", limit: 120 });
    let nextStatus = status;
    if (status === "sent") {
      const viewedAt = new Date().toISOString();
      const { data, error } = await db.from("billing_consents").update({ status: "viewed", last_viewed_at: viewedAt }).eq("id", consent.id).eq("status", "sent").select("id").maybeSingle();
      if (error) throw new Error(error.message);
      if (data) {
        nextStatus = "viewed";
        await recordBillingConsentEvent({ db, consentId: consent.id, type: "viewed", request });
      }
    }
    return NextResponse.json({
      ok: true,
      consent: {
        documentId: consent.document_id,
        customerName: String(consent.customer_snapshot?.name || "고객"),
        total: Number(consent.total),
        status: nextStatus,
        verificationChannel: consent.verification_channel,
        verificationTargetMasked: consent.verification_target_masked,
        expiresAt: consent.expires_at,
        authenticated: Boolean(getBillingConsentSession(request, consent)),
      },
    });
  } catch (error) {
    return billingConsentErrorResponse(error);
  }
}
