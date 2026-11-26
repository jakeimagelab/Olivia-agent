import { randomUUID } from "node:crypto";
import { gmailTransport } from "@/lib/mail/gmailTransport";
import { getSupabaseAdmin } from "@/lib/supabase";
import { renderTransactionStatementPdf } from "./renderTransactionStatementPdf";
import { newStatementReceiptToken, statementReceiptPage } from "./transactionStatementReceipt";
import { statementMailDefaults, type StatementReceiptMode } from "./transactionStatementDetails";
import { loadTransactionStatement, STATEMENT_BUCKET, TransactionStatementError } from "./transactionStatementStore";

const EMAIL = /^[^\s<>@,;]+@[^\s<>@,;]+\.[^\s<>@,;]+$/u;

function receiptBaseUrl(requestOrigin: string) {
  const configured = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || process.env.NEXT_PUBLIC_BASE_URL;
  const base = new URL(configured || (process.env.NODE_ENV === "production" ? "https://olivia.photoclinic.kr" : requestOrigin));
  if (!["https:", "http:"].includes(base.protocol)) throw new Error("고객 포털 주소 설정을 확인해 주세요.");
  return base.origin;
}

export async function sendTransactionStatement(
  id: string,
  input: { to: unknown; subject: unknown; message?: unknown; confirmed: unknown; mode?: unknown; updatedAt?: unknown },
  requestOrigin: string,
  db = getSupabaseAdmin(),
) {
  const to = typeof input.to === "string" ? input.to.trim() : "";
  const subject = typeof input.subject === "string" ? input.subject.trim() : "";
  const message = typeof input.message === "string" ? input.message.trim() : "";
  if (input.confirmed !== true || !EMAIL.test(to) || to.length > 254 || !subject || subject.length > 250 || /[\r\n]/.test(subject)) {
    throw new TransactionStatementError("받는 사람과 제목을 확인한 다음 발송해 주세요.", 400);
  }
  if (input.mode !== undefined && input.mode !== "confirm" && input.mode !== "sign") {
    throw new TransactionStatementError("발송 방식을 확인해 주세요.", 400);
  }
  if (message.length > 5000) throw new TransactionStatementError("메일 내용은 5,000자까지 입력해 주세요.", 400);
  const mode: StatementReceiptMode = input.mode ?? "confirm";
  const statement = await loadTransactionStatement(id, db);
  if (!statement) throw new TransactionStatementError("거래명세서를 찾지 못했습니다.", 404);
  if (statement.status !== "draft") throw new TransactionStatementError("이미 발송한 거래명세서입니다.", 409);
  if (input.updatedAt !== undefined && input.updatedAt !== statement.updated_at) {
    throw new TransactionStatementError("거래명세서가 변경되었습니다. 최신 PDF를 확인한 뒤 다시 발송해 주세요.", 409);
  }
  const { user, client } = gmailTransport();
  const { brandName } = statementMailDefaults(statement);
  const { token, hash } = newStatementReceiptToken();
  const url = new URL(statementReceiptPage(token), receiptBaseUrl(requestOrigin)).toString();
  const attempt = randomUUID();
  let claim = db.from("transaction_statements")
    .update({ send_attempt_id: attempt, updated_at: new Date().toISOString() })
    .eq("id", id).eq("status", "draft").is("send_attempt_id", null);
  if (statement.updated_at) claim = claim.eq("updated_at", statement.updated_at);
  const { data: claimed, error: claimError } = await claim.select("id").maybeSingle();
  if (claimError) throw new TransactionStatementError("발송을 준비하지 못했습니다.", 500);
  if (!claimed) throw new TransactionStatementError("거래명세서가 변경됐거나 이미 발송 중입니다. 화면을 새로고침해 주세요.", 409);

  const pdfPath = `${id}/sent.pdf`;
  try {
    const pdf = await renderTransactionStatementPdf({ ...statement, receipt_mode: mode }, true);
    const { error } = await db.storage.from(STATEMENT_BUCKET).upload(pdfPath, pdf, {
      contentType: "application/pdf",
      upsert: true,
    });
    if (error) throw new TransactionStatementError("발송할 PDF를 저장하지 못했습니다.", 500);
    await client.sendMail({
      from: { name: process.env.GMAIL_FROM_NAME || brandName, address: user },
      to,
      subject,
      text: `${message || `안녕하세요. ${brandName}입니다.\n거래명세서 ${statement.statement_number}를 첨부합니다.`}\n확인 후 아래 링크에서 ${mode === "sign" ? "이름과 서명을 남겨 주세요" : "수신확인을 남겨 주세요"}.\n\n${url}`,
      attachments: [{ filename: `${statement.statement_number}.pdf`, content: pdf, contentType: "application/pdf" }],
    });
  } catch (error) {
    const released = await db.from("transaction_statements").update({ send_attempt_id: null })
      .eq("id", id).eq("send_attempt_id", attempt).eq("status", "draft");
    if (released.error) console.error("[transaction-statements] send lock release failed", released.error.code);
    if (error instanceof TransactionStatementError) throw error;
    throw new TransactionStatementError("이메일을 발송하지 못했습니다. 메일 설정을 확인한 뒤 다시 시도해 주세요.", 502);
  }

  const sentAt = new Date().toISOString();
  const patch = {
    status: "sent",
    sent_at: sentAt,
    updated_at: sentAt,
    pdf_path: pdfPath,
    receipt_token_hash: hash,
    receipt_mode: mode,
    send_attempt_id: null,
  };
  for (let retry = 0; retry < 2; retry += 1) {
    const { data, error } = await db.from("transaction_statements").update(patch)
      .eq("id", id).eq("status", "draft").eq("send_attempt_id", attempt).select("id").maybeSingle();
    if (!error && data) return { sentAt, receiptMode: mode };
    if (!error) {
      const current = await loadTransactionStatement(id, db);
      if (current?.status === "sent" || current?.status === "confirmed") return { sentAt, receiptMode: mode };
    }
  }
  throw new TransactionStatementError("메일은 발송됐지만 발송 기록을 저장하지 못했습니다. 발송 상태를 확인해 주세요.", 500);
}
