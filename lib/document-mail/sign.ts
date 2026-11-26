import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { parseBillingConsentSignature } from "@/lib/billing-consent/signature";
import { applyCustomerContractSignature } from "@/lib/contract/contractDocument";
import { renderA4HtmlPdf } from "@/lib/contract/renderContractPdf";
import { isPcrmUuid } from "@/lib/pcrm/validation";
import {
  DOCUMENT_MAIL_BUCKET, DOCUMENT_MAIL_TABLE, DocumentMailError, documentMailHash, loadReceivedDocuments,
  loadSignedMailContract,
} from "./repository";

export async function signReceivedContract(db: SupabaseClient, token: string, input: Record<string, unknown>) {
  const delivery = await loadReceivedDocuments(db, token);
  if (!delivery) throw new DocumentMailError("문서 링크가 만료되었거나 유효하지 않습니다.", 404);
  if (delivery.signed_at && delivery.signer_name && delivery.signed_pdf_path) {
    return { signedAt: delivery.signed_at, signerName: delivery.signer_name };
  }
  if (!delivery.contract_id || !delivery.contract_html || !delivery.contract_sha256) {
    throw new DocumentMailError("전자서명할 계약서가 없습니다.", 409);
  }
  const name = typeof input.name === "string" ? input.name.trim().normalize("NFC") : "";
  const requestId = input.requestId;
  if (!isPcrmUuid(requestId) || !name || name.length > 80 || /[\u0000-\u001f\u007f]/.test(name)
    || input.acknowledged !== true || input.contractVersion !== delivery.contract_sha256) {
    throw new DocumentMailError("계약서 내용을 확인한 뒤 이름을 입력하고 동의해 주세요.");
  }
  if (typeof input.signatureDataUrl !== "string" || input.signatureDataUrl.length > 500_000) {
    throw new DocumentMailError("서명란에 직접 서명해 주세요.");
  }
  const limit = await db.rpc("consume_select_public_rate_limit", {
    p_key_hash: documentMailHash(`document-mail-sign:${delivery.id}`), p_limit: 10, p_window_seconds: 900,
  });
  if (limit.error) throw limit.error;
  if (limit.data !== true) throw new DocumentMailError("서명 요청이 많습니다. 15분 뒤 다시 시도해 주세요.", 429);

  const [contract, previous] = await Promise.all([
    db.from("contracts").select("updated_at").eq("id", delivery.contract_id).maybeSingle(),
    loadSignedMailContract(db, delivery.contract_id),
  ]);
  if (contract.error) throw contract.error;
  if (previous) throw new DocumentMailError("이미 서명이 완료된 계약서입니다. 이 링크에서 서명 상태를 다시 확인해 주세요.", 409);
  if (!contract.data || (contract.data.updated_at ?? null) !== delivery.contract_version_at) {
    throw new DocumentMailError("계약서가 수정되었습니다. 담당자에게 최신 계약서 링크를 요청해 주세요.", 409);
  }
  const signature = await parseBillingConsentSignature(input.signatureDataUrl, 1_500_000).catch(() => null);
  if (!signature) throw new DocumentMailError("서명 이미지가 비어 있습니다. 다시 서명해 주세요.");

  const signedAt = new Date().toISOString();
  const html = applyCustomerContractSignature(delivery.contract_html, {
    name, signedAt, image: signature.dataUrl, originalPdfSha256: delivery.contract_sha256,
  });
  const pdf = await renderA4HtmlPdf(html);
  const pdfPath = `${delivery.id}/signature-${randomUUID()}.pdf`;
  const bucket = db.storage.from(DOCUMENT_MAIL_BUCKET);
  const { error: uploadError } = await bucket.upload(pdfPath, pdf, { contentType: "application/pdf", upsert: false });
  if (uploadError) throw uploadError;

  const completion = await db.rpc("complete_document_mail_signature", {
    p_delivery_id: delivery.id, p_token_hash: delivery.token_hash, p_request_id: requestId, p_signer_name: name,
    p_signed_at: signedAt, p_pdf_path: pdfPath, p_pdf_sha256: documentMailHash(pdf),
  });
  // Re-read after an ambiguous response so a retried signature always returns the stored receipt.
  const { data: saved, error: readError } = await db.from(DOCUMENT_MAIL_TABLE)
    .select("signed_at,signer_name,signed_pdf_path").eq("id", delivery.id).maybeSingle();
  if (readError) throw readError;
  if (saved?.signed_pdf_path !== pdfPath && (!completion.error || saved?.signed_pdf_path)) {
    const result = await bucket.remove([pdfPath]);
    if (result.error) console.error("[document-mail] extra signed PDF cleanup", result.error.name);
  }
  if (saved?.signed_at && saved.signer_name && saved.signed_pdf_path) {
    return { signedAt: saved.signed_at as string, signerName: saved.signer_name as string };
  }
  if (completion.error) throw completion.error;
  if (completion.data === "changed") throw new DocumentMailError("계약서가 수정되었습니다. 최신 링크를 요청해 주세요.", 409);
  if (completion.data === "already_signed") throw new DocumentMailError("다른 링크에서 이미 서명이 완료된 계약서입니다.", 409);
  throw new DocumentMailError("이 계약서는 서명을 접수할 수 없습니다.", 409);
}
