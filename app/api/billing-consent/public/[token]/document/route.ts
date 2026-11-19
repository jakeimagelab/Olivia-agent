import { NextRequest } from "next/server";
import {
  billingConsentErrorResponse,
  loadBillingConsentByToken,
  requireBillingConsentSession,
  BILLING_CONSENT_BUCKET,
} from "@/lib/billing-consent/server";

export const runtime = "nodejs";

export async function GET(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;
    const { db, consent, status } = await loadBillingConsentByToken(token);
    requireBillingConsentSession(request, consent);
    const evidence = await Promise.all((Array.isArray(consent.evidence) ? consent.evidence : []).map(async (item) => {
      if (item.kind !== "image" || typeof item.storagePath !== "string") return item;
      const { data, error } = await db.storage.from(BILLING_CONSENT_BUCKET).createSignedUrl(item.storagePath, 600);
      if (error) throw new Error(error.message);
      const safe = { ...item };
      delete safe.storagePath;
      return { ...safe, url: data.signedUrl };
    }));
    return Response.json({
      ok: true,
      consent: {
        documentId: consent.document_id,
        version: consent.version,
        status,
        customer: {
          name: consent.customer_snapshot?.name || "고객",
          contactName: consent.customer_snapshot?.contactName || "",
        },
        issuer: consent.issuer_snapshot,
        items: consent.items,
        subtotal: Number(consent.subtotal),
        vat: Number(consent.vat),
        total: Number(consent.total),
        reason: consent.reason,
        evidence,
        bankInfo: consent.bank_info,
        dueDate: consent.due_date,
        expiresAt: consent.expires_at,
        signerName: consent.signer_name,
        signedAt: consent.signed_at,
        objectionReason: consent.objection_reason,
        canDownload: status === "signed" && Boolean(consent.pdf_path),
      },
    });
  } catch (error) {
    return billingConsentErrorResponse(error);
  }
}
