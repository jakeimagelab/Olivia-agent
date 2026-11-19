import { NextRequest, NextResponse } from "next/server";
import {
  billingConsentErrorResponse,
  loadBillingConsentByToken,
  recordBillingConsentEvent,
  requireBillingConsentSession,
} from "@/lib/billing-consent/server";
import { downloadBillingConsentArtifact } from "@/lib/billing-consent/storage";

export const runtime = "nodejs";

export async function GET(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;
    const { db, consent, status } = await loadBillingConsentByToken(token);
    requireBillingConsentSession(request, consent);
    if (status !== "signed" || !consent.pdf_path) return NextResponse.json({ ok: false, error: "서명 완료 후 PDF를 받을 수 있습니다." }, { status: 403 });
    const pdf = await downloadBillingConsentArtifact(consent.pdf_path);
    await recordBillingConsentEvent({ db, consentId: consent.id, type: "pdf_downloaded", request });
    return new NextResponse(pdf, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${consent.document_id}.pdf"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    return billingConsentErrorResponse(error);
  }
}
