import { NextRequest, NextResponse } from "next/server";
import { billingConsentEvidenceSha256, billingConsentPdfSha256 } from "@/lib/billing-consent/evidence";
import { sendBillingConsentSignedEmail } from "@/lib/billing-consent/email";
import { renderBillingConsentPdf } from "@/lib/billing-consent/pdf";
import {
  billingConsentErrorResponse,
  billingConsentRequestContext,
  cleanBillingConsentText,
  enforceBillingConsentRateLimit,
  loadBillingConsentByToken,
  recordBillingConsentEvent,
  requireBillingConsentSession,
} from "@/lib/billing-consent/server";
import { sha256Hex } from "@/lib/billing-consent/security";
import { parseBillingConsentSignature } from "@/lib/billing-consent/signature";
import {
  loadBillingConsentEvidenceImages,
  removeBillingConsentArtifacts,
  uploadBillingConsentArtifact,
} from "@/lib/billing-consent/storage";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;
    const { db, consent, status } = await loadBillingConsentByToken(token);
    requireBillingConsentSession(request, consent);
    await enforceBillingConsentRateLimit({ db, request, token, action: "sign", limit: 5, windowSeconds: 300 });
    if (status !== "sent" && status !== "viewed") {
      if (status === "signed") return NextResponse.json({ ok: true, alreadySigned: true, documentId: consent.document_id });
      return NextResponse.json({ ok: false, error: "현재 문서에는 서명할 수 없습니다." }, { status: 409 });
    }
    const body = await request.json() as Record<string, unknown>;
    if (body.confirmedContent !== true || body.agreedToPay !== true) {
      return NextResponse.json({ ok: false, error: "청구 내용 확인과 지급 동의에 모두 체크해 주세요." }, { status: 400 });
    }
    const signerName = cleanBillingConsentText(body.signerName, 100);
    if (!signerName) return NextResponse.json({ ok: false, error: "서명자 이름을 입력해 주세요." }, { status: 400 });
    const signature = await parseBillingConsentSignature(body.signatureDataUrl);
    const signatureSha256 = sha256Hex(signature.buffer);
    const signedAt = new Date().toISOString();
    const context = billingConsentRequestContext(request);
    const consentChecks = { confirmedContent: true, agreedToPay: true };
    const documentEvidenceSha256 = billingConsentEvidenceSha256({
      documentId: consent.document_id,
      version: consent.version,
      customer: consent.customer_snapshot,
      issuer: consent.issuer_snapshot,
      contract: consent.contract_snapshot,
      items: consent.items,
      subtotal: Number(consent.subtotal),
      vat: Number(consent.vat),
      total: Number(consent.total),
      reason: consent.reason,
      evidence: consent.evidence,
      bankInfo: consent.bank_info,
      dueDate: consent.due_date,
      signerName,
      consentChecks,
      signedAt,
      signedIp: context.ip,
      signedUa: context.ua,
      signatureSha256,
    });
    const signedConsent = {
      ...consent,
      status: "signed" as const,
      signer_name: signerName,
      consent_checks: consentChecks,
      signed_at: signedAt,
      signed_ip: context.ip,
      signed_ua: context.ua,
      signature_sha256: signatureSha256,
      document_evidence_sha256: documentEvidenceSha256,
    };
    const evidenceImages = await loadBillingConsentEvidenceImages(consent);
    const pdf = await renderBillingConsentPdf({ consent: signedConsent, signatureDataUrl: signature.dataUrl, evidenceImages });
    const pdfSha256 = billingConsentPdfSha256(pdf);
    const signaturePath = `${consent.id}/signature-v${consent.version}.${signature.extension}`;
    const pdfPath = `${consent.id}/signed-v${consent.version}.pdf`;
    const uploaded: string[] = [];
    try {
      await uploadBillingConsentArtifact({ path: signaturePath, data: signature.buffer, contentType: signature.mimeType });
      uploaded.push(signaturePath);
      await uploadBillingConsentArtifact({ path: pdfPath, data: pdf, contentType: "application/pdf" });
      uploaded.push(pdfPath);
      const { data: finalized, error } = await db.rpc("finalize_billing_consent_signature", {
        p_consent_id: consent.id,
        p_signer_name: signerName,
        p_consent_checks: consentChecks,
        p_signed_at: signedAt,
        p_signed_ip: context.ip,
        p_signed_ua: context.ua,
        p_signature_path: signaturePath,
        p_signature_sha256: signatureSha256,
        p_document_evidence_sha256: documentEvidenceSha256,
        p_pdf_path: pdfPath,
        p_pdf_sha256: pdfSha256,
      });
      if (error) throw new Error(error.message);
      if (!finalized) throw new Error("서명 결과를 저장하지 못했습니다.");
    } catch (error) {
      await removeBillingConsentArtifacts(uploaded).catch(() => undefined);
      throw error;
    }

    const customerEmail = String(consent.customer_snapshot?.email || "");
    const adminEmail = process.env.BILLING_CONSENT_ADMIN_EMAIL || process.env.GMAIL_USER || "";
    const recipients = [...new Set([customerEmail, adminEmail].filter(Boolean))];
    const mailResults = await Promise.allSettled(recipients.map((to) => sendBillingConsentSignedEmail({
      to,
      customerName: String(consent.customer_snapshot?.name || "고객"),
      documentId: consent.document_id,
      pdf,
    })));
    for (let index = 0; index < mailResults.length; index += 1) {
      const result = mailResults[index];
      await recordBillingConsentEvent({
        db,
        consentId: consent.id,
        type: result.status === "fulfilled" ? "email_sent" : "email_failed",
        request,
        meta: result.status === "fulfilled"
          ? { kind: "signed_pdf", recipient: index === 0 ? "customer" : "admin" }
          : { kind: "signed_pdf", recipient: index === 0 ? "customer" : "admin", reason: String(result.reason).slice(0, 300) },
      }).catch(() => undefined);
    }
    return NextResponse.json({ ok: true, documentId: consent.document_id, pdfSha256 });
  } catch (error) {
    return billingConsentErrorResponse(error);
  }
}
