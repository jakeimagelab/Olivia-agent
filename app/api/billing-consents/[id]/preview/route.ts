import { NextRequest, NextResponse } from "next/server";
import { isAdminSession } from "@/lib/passkey";
import { billingConsentErrorResponse, loadBillingConsentById, recordBillingConsentEvent } from "@/lib/billing-consent/server";
import { renderBillingConsentPdf } from "@/lib/billing-consent/pdf";
import { loadBillingConsentEvidenceImages } from "@/lib/billing-consent/storage";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isAdminSession(request)) return NextResponse.json({ ok: false, error: "관리자 로그인이 필요합니다." }, { status: 401 });
  try {
    const { id } = await params;
    const consent = await loadBillingConsentById(id);
    if (!consent) return NextResponse.json({ ok: false, error: "청구 동의서를 찾지 못했습니다." }, { status: 404 });
    const evidenceImages = await loadBillingConsentEvidenceImages(consent);
    const pdf = await renderBillingConsentPdf({ consent, evidenceImages, preview: true });
    await recordBillingConsentEvent({ consentId: id, type: "previewed", request });
    return new NextResponse(pdf, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${consent.document_id}-preview.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return billingConsentErrorResponse(error);
  }
}
