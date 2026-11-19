import { NextRequest, NextResponse } from "next/server";
import { isAdminSession } from "@/lib/passkey";
import { billingConsentErrorResponse, loadBillingConsentById } from "@/lib/billing-consent/server";
import { downloadBillingConsentArtifact } from "@/lib/billing-consent/storage";

export const runtime = "nodejs";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isAdminSession(request)) return NextResponse.json({ ok: false, error: "관리자 로그인이 필요합니다." }, { status: 401 });
  try {
    const { id } = await params;
    const consent = await loadBillingConsentById(id);
    if (!consent?.pdf_path) return NextResponse.json({ ok: false, error: "서명 완료 PDF가 없습니다." }, { status: 404 });
    const pdf = await downloadBillingConsentArtifact(consent.pdf_path);
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
