import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { billingConsentPdfMatches } from "@/lib/billing-consent/evidence";
import { billingConsentErrorResponse, recordBillingConsentEvent } from "@/lib/billing-consent/server";

export const runtime = "nodejs";

export async function POST(request: NextRequest, { params }: { params: Promise<{ documentId: string }> }) {
  try {
    const { documentId } = await params;
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return NextResponse.json({ ok: false, error: "확인할 PDF를 선택해 주세요." }, { status: 400 });
    if (file.type !== "application/pdf" || file.size < 5 || file.size > 25 * 1024 * 1024) {
      return NextResponse.json({ ok: false, error: "25MB 이하 PDF 파일만 확인할 수 있습니다." }, { status: 400 });
    }
    const db = getSupabaseAdmin();
    const { data: consent, error } = await db.from("billing_consents").select("id,pdf_sha256").eq("document_id", documentId).eq("status", "signed").maybeSingle();
    if (error) throw new Error(error.message);
    if (!consent?.pdf_sha256) return NextResponse.json({ ok: false, error: "확인할 수 없는 문서 ID입니다." }, { status: 404 });
    const buffer = Buffer.from(await file.arrayBuffer());
    const matches = billingConsentPdfMatches(buffer, consent.pdf_sha256);
    await recordBillingConsentEvent({ db, consentId: consent.id, type: matches ? "verified_match" : "verified_mismatch", request });
    return NextResponse.json({ ok: true, documentId, matches, verifiedAt: new Date().toISOString() });
  } catch (error) {
    return billingConsentErrorResponse(error);
  }
}
