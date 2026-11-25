import { randomUUID } from "node:crypto";
import { parseBillingConsentSignature } from "@/lib/billing-consent/signature";
import { getSupabaseAdmin } from "@/lib/supabase";
import { renderTransactionStatementPdf } from "./renderTransactionStatementPdf";
import { loadStatementByReceiptHash, STATEMENT_BUCKET, TransactionStatementError, type TransactionStatement } from "./transactionStatementStore";

function receipt(statement: Pick<TransactionStatement, "confirmed_at" | "confirmed_by" | "signed_pdf_path">) {
  return { confirmedAt: statement.confirmed_at, confirmedBy: statement.confirmed_by, signed: Boolean(statement.signed_pdf_path) };
}

export async function confirmTransactionStatement(
  hash: string,
  input: { name: string; signatureDataUrl?: unknown; acknowledged?: unknown },
  db = getSupabaseAdmin(),
) {
  const statement = await loadStatementByReceiptHash(hash, db);
  if (!statement) throw new TransactionStatementError("거래명세서 확인 링크가 유효하지 않습니다.", 404);
  if (statement.status === "confirmed") return receipt(statement);

  const confirmedAt = new Date().toISOString();
  const signing = statement.receipt_mode === "sign";
  const patch = { status: "confirmed" as const, confirmed_at: confirmedAt, confirmed_by: input.name, updated_at: confirmedAt };
  let signedPath: string | undefined;
  if (signing) {
    if (input.acknowledged !== true) throw new TransactionStatementError("거래명세서 내용을 확인해 주세요.", 400);
    if (typeof input.signatureDataUrl !== "string" || input.signatureDataUrl.length > 500_000) {
      throw new TransactionStatementError("서명을 입력해 주세요.", 400);
    }
    const signature = await parseBillingConsentSignature(input.signatureDataUrl, 1_500_000).catch(() => null);
    if (!signature) throw new TransactionStatementError("서명이 확인되지 않습니다. 다시 서명해 주세요.", 400);
    const pdf = await renderTransactionStatementPdf({ ...statement, ...patch }, true, signature.dataUrl);
    signedPath = `${statement.id}/signed/${randomUUID()}.pdf`;
    const { error } = await db.storage.from(STATEMENT_BUCKET).upload(signedPath, pdf, { contentType: "application/pdf", upsert: false });
    if (error) throw new TransactionStatementError("서명한 PDF를 저장하지 못했습니다.", 500);
  }

  const { data, error } = await db.from("transaction_statements")
    .update(signedPath ? { ...patch, signed_pdf_path: signedPath } : patch)
    .eq("id", statement.id).eq("receipt_token_hash", hash).eq("status", "sent")
    .select("confirmed_at,confirmed_by,signed_pdf_path").maybeSingle();
  if (!error && data) return receipt(data);
  const current = await loadStatementByReceiptHash(hash, db);
  if (signedPath && current?.signed_pdf_path !== signedPath && (!error || current?.status === "confirmed")) {
    const cleanup = await db.storage.from(STATEMENT_BUCKET).remove([signedPath]);
    if (cleanup.error) console.error("[transaction-statements] signed PDF cleanup failed", cleanup.error.name);
  }
  if (current?.status === "confirmed") return receipt(current);
  if (error) throw new TransactionStatementError(signing ? "서명을 저장하지 못했습니다." : "수신확인을 저장하지 못했습니다.", 500);
  throw new TransactionStatementError("거래명세서 확인 링크가 유효하지 않습니다.", 404);
}
