import { randomUUID } from "node:crypto";
import { getSupabaseAdmin } from "@/lib/supabase";
import { STATEMENT_REGISTRATION_LIMIT, type StatementPartyKey, type StatementRegistrationDocuments } from "./transactionStatementDetails";
import { assertStatementEditable, STATEMENT_BUCKET, TransactionStatementError, updateStatementDraft, type TransactionStatement } from "./transactionStatementStore";

function detectRegistrationType(buffer: Buffer) {
  if (buffer.subarray(0, 5).toString() === "%PDF-") return { contentType: "application/pdf", extension: "pdf" } as const;
  if (buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return { contentType: "image/png", extension: "png" } as const;
  if (buffer[0] === 255 && buffer[1] === 216 && buffer[2] === 255) return { contentType: "image/jpeg", extension: "jpg" } as const;
  throw new TransactionStatementError("사업자등록증은 PDF, JPG, PNG 파일을 첨부해 주세요.", 400);
}

export async function saveStatementRegistration(
  statement: TransactionStatement, party: StatementPartyKey, file: File, db = getSupabaseAdmin(),
) {
  assertStatementEditable(statement);
  if (!file.size || file.size > STATEMENT_REGISTRATION_LIMIT) {
    throw new TransactionStatementError("사업자등록증은 4MB 이하로 첨부해 주세요.", 413);
  }
  const bytes = Buffer.from(await file.arrayBuffer());
  const { contentType, extension } = detectRegistrationType(bytes);
  const path = `${statement.id}/registration/${party}-${randomUUID()}.${extension}`;
  const name = file.name.normalize("NFC").replace(/[\p{Cc}\\/]/gu, "_").slice(0, 160) || `사업자등록증.${extension}`;
  const storage = db.storage.from(STATEMENT_BUCKET);
  const { error } = await storage.upload(path, bytes, { contentType, upsert: false });
  if (error) throw new TransactionStatementError("사업자등록증을 저장하지 못했습니다.", 500);
  const documents: StatementRegistrationDocuments = { ...statement.registration_documents, [party]: { name, path, contentType } };
  try {
    return await updateStatementDraft(statement, { registration_documents: documents }, db);
  } catch (error) {
    if (error instanceof TransactionStatementError && error.status === 409) {
      const cleanup = await storage.remove([path]);
      if (cleanup.error) console.error("[transaction-statements] registration cleanup failed", cleanup.error.name);
    }
    throw error;
  }
}
