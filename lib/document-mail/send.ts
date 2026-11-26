import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { BrowserContext } from "playwright-core";
import { buildContractHtmlFromRow, CONTRACT_BRAND_CONFIG, type ContractBrand } from "@/lib/contract/contractDocument";
import { renderA4HtmlPdf } from "@/lib/contract/renderContractPdf";
import { withDocumentPdfContext } from "@/lib/documentPdfBrowser";
import { gmailTransport } from "@/lib/mail/gmailTransport";
import { isPcrmUuid } from "@/lib/pcrm/validation";
import { renderQuoteBuffer } from "@/lib/quote/renderQuotePdf";
import { renderTransactionStatementPdf } from "@/lib/quote/renderTransactionStatementPdf";
import { STATEMENT_BUCKET, TransactionStatementError, type TransactionStatement } from "@/lib/quote/transactionStatementStore";
import { defaultDocumentMailMessage, documentMailBody } from "./email";
import {
  createDocumentMailToken, DOCUMENT_MAIL_BUCKET, DOCUMENT_MAIL_SOURCE, DOCUMENT_MAIL_SOURCE_ID, DOCUMENT_MAIL_TABLE,
  DocumentMailError, documentMailHash, loadDocumentMailSources, type DocumentMailSource,
} from "./repository";
import {
  DOCUMENT_MAIL_EXPIRY_DAYS, DOCUMENT_MAIL_LABELS, isDocumentMailKind, receivedDocumentsPath,
  type DeliveredDocument, type DocumentMailPreview, type DocumentMailReference, type DocumentMailSelection,
} from "./shared";

const EMAIL = /^[^\s<>@,;]+@[^\s<>@,;]+\.[^\s<>@,;]+$/u;

export function documentMailReference(kind: unknown, id: unknown): DocumentMailReference {
  if (!isDocumentMailKind(kind) || !isPcrmUuid(id)) throw new DocumentMailError("발송할 문서를 선택해 주세요.");
  return { kind, id: id.toLowerCase() };
}

export function selectDocumentMailSources(sources: DocumentMailSource[], input: DocumentMailSelection[]) {
  if (!input.length || input.length > 3 || new Set(input.map(({ kind }) => kind)).size !== input.length) {
    throw new DocumentMailError("종류별로 한 문서씩 선택해 주세요.");
  }
  return input.map(({ kind, id, version }) => {
    const record = sources.find(({ choice }) => choice.kind === kind && choice.id === id);
    if (!record) throw new DocumentMailError("현재 문서와 연결된 항목을 선택해 주세요.", 409, "NOT_SENT");
    if (record.choice.version !== version) throw new DocumentMailError("문서가 변경되었습니다. 발송 패널을 다시 열어 최신본을 확인해 주세요.", 409, "NOT_SENT");
    return record;
  });
}

function selectionFromInput(raw: unknown): DocumentMailSelection[] {
  if (!Array.isArray(raw)) throw new DocumentMailError("발송할 문서를 선택해 주세요.");
  return raw.map((entry) => {
    const reference = documentMailReference(entry?.kind, entry?.id);
    if (entry.version !== null && typeof entry.version !== "string") throw new DocumentMailError("문서 버전을 확인하지 못했습니다.");
    return { ...reference, version: entry.version };
  });
}

function deliveryOrigin(origin: string) {
  const base = new URL(process.env.NEXT_PUBLIC_BASE_URL || (process.env.NODE_ENV === "production" ? "https://olivia.photoclinic.kr" : origin));
  if (!["http:", "https:"].includes(base.protocol) || (process.env.NODE_ENV === "production" && base.protocol !== "https:")) {
    throw new DocumentMailError("고객 문서함 주소를 확인해 주세요.", 500);
  }
  return base.origin;
}

function documentBrand(sources: DocumentMailSource[]): ContractBrand {
  return sources.some(({ choice, row }) => /^(JKQ|JI)-/.test(choice.number)
    || (row.form_state as { brand?: string } | null)?.brand === "jakeimage"
    || (row.snapshot as TransactionStatement["snapshot"] | undefined)?.document?.brand === "jakeimage")
    ? "jakeimage" : "photoclinic";
}

function documentContactName(sources: DocumentMailSource[]) {
  for (const { row } of sources) {
    const name = row.contact_name || (row.quote_data as { contactName?: string } | null)?.contactName
      || (row.snapshot as TransactionStatement["snapshot"] | undefined)?.document?.customer?.managerName;
    if (typeof name === "string" && name.trim()) return name;
  }
  return "";
}

export async function previewDocumentMail(db: SupabaseClient, anchor: DocumentMailReference): Promise<DocumentMailPreview> {
  const [sources, last] = await Promise.all([
    loadDocumentMailSources(db, anchor),
    db.from(DOCUMENT_MAIL_TABLE).select("recipient_email,sent_at,signed_at")
      .eq(DOCUMENT_MAIL_SOURCE_ID[anchor.kind], anchor.id).eq("state", "sent")
      .order("sent_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  if (last.error) throw last.error;
  const row = sources.find(({ choice }) => choice.kind === anchor.kind && choice.id === anchor.id)?.row;
  const brand = documentBrand(sources);
  const brandLabel = CONTRACT_BRAND_CONFIG[brand].label;
  const customerName = row?.hospital_name || "고객";
  const recipient = row?.email || sources.find((entry) => entry.row.email)?.row.email || "";
  return {
    customerName, recipient, brandLabel, subject: `[${brandLabel}] ${customerName} 문서 안내`,
    message: defaultDocumentMailMessage(brand, documentContactName(sources)),
    documents: sources.map(({ choice }) => choice),
    ...(last.data?.sent_at ? { latest: { recipient: last.data.recipient_email, sentAt: last.data.sent_at, signedAt: last.data.signed_at || undefined } } : {}),
  };
}

async function assertCurrentVersion(db: SupabaseClient, entry: DocumentMailSource) {
  const { choice } = entry;
  const { data, error } = await db.from(DOCUMENT_MAIL_SOURCE[choice.kind]).select("updated_at").eq("id", choice.id).maybeSingle();
  if (error) throw error;
  if (!data || (data.updated_at ?? null) !== choice.version) {
    throw new DocumentMailError(`${DOCUMENT_MAIL_LABELS[choice.kind]}가 변경되었습니다. 최신본을 확인한 뒤 보내 주세요.`, 409, "NOT_SENT");
  }
}

function archivedStatementPdf(statement: TransactionStatement) {
  return statement.status !== "draft" ? statement.signed_pdf_path || statement.pdf_path : undefined;
}

async function statementPdf(db: SupabaseClient, statement: TransactionStatement, context?: BrowserContext) {
  const path = archivedStatementPdf(statement);
  if (path) {
    const { data, error } = await db.storage.from(STATEMENT_BUCKET).download(path);
    if (error || !data) throw new DocumentMailError("보관된 거래명세서 PDF를 읽지 못했습니다.", 502, "NOT_SENT");
    return Buffer.from(await data.arrayBuffer());
  }
  try {
    return await renderTransactionStatementPdf(statement, true, undefined, context);
  } catch (error) {
    if (error instanceof TransactionStatementError) throw new DocumentMailError(error.message, error.status, "NOT_SENT");
    throw error;
  }
}

export async function sendDocumentMail(
  db: SupabaseClient, anchor: DocumentMailReference, input: Record<string, unknown>, origin: string,
) {
  const to = typeof input.to === "string" ? input.to.trim() : "";
  const subject = typeof input.subject === "string" ? input.subject.trim() : "";
  const message = typeof input.message === "string" ? input.message.trim() : "";
  const requestId = input.requestId;
  if (!isPcrmUuid(requestId) || input.confirmed !== true || !EMAIL.test(to) || to.length > 254
    || !subject || subject.length > 200 || /[\r\n]/.test(subject) || !message || message.length > 5000) {
    throw new DocumentMailError("받는 주소, 제목과 본문을 확인해 주세요.");
  }
  const selection = selectionFromInput(input.documents);
  const requestHash = documentMailHash(JSON.stringify({ anchor, selection, to, subject, message }));
  const existing = await db.from(DOCUMENT_MAIL_TABLE).select("request_hash,state,sent_at")
    .eq("request_id", requestId).maybeSingle();
  if (existing.error) throw existing.error;
  if (existing.data) {
    if (existing.data.request_hash !== requestHash) throw new DocumentMailError("진행 중인 발송의 주소나 문서가 바뀌었습니다. 발송 상태부터 확인해 주세요.", 409, "IN_PROGRESS");
    if (existing.data.state === "sent") return { sentAt: existing.data.sent_at, documentCount: selection.length };
    if (existing.data.state === "failed") throw new DocumentMailError("이 발송은 실패했습니다. 내용을 확인한 뒤 다시 시도해 주세요.", 409, "NOT_SENT");
    throw new DocumentMailError("발송하고 있거나 메일 서버의 응답을 확인 중입니다. 잠시 후 상태를 확인해 주세요.", 409, "IN_PROGRESS");
  }
  const sources = await loadDocumentMailSources(db, anchor);
  const records = selectDocumentMailSources(sources, selection);
  const selectedContract = records.find(({ choice }) => choice.kind === "contract");
  const customerName = records.find(({ row }) => row.hospital_name)?.row.hospital_name || "고객";
  const brand = documentBrand(records);
  const baseUrl = deliveryOrigin(origin);
  let transport: ReturnType<typeof gmailTransport>;
  try { transport = gmailTransport({ connectionTimeout: 12_000, greetingTimeout: 10_000, socketTimeout: 25_000 }); }
  catch { throw new DocumentMailError("이메일 발송 설정을 확인해 주세요.", 503, "NOT_SENT"); }

  const id = randomUUID();
  const token = createDocumentMailToken();
  const expiresAt = new Date(Date.now() + DOCUMENT_MAIL_EXPIRY_DAYS * 86_400_000).toISOString();
  const ids = Object.fromEntries(records.map(({ choice }) => [DOCUMENT_MAIL_SOURCE_ID[choice.kind], choice.id]));
  const quoteId = sources.find(({ choice }) => choice.kind === "quote")?.choice.id;
  const { error: createError } = await db.from(DOCUMENT_MAIL_TABLE).insert({
    id, request_id: requestId, request_hash: requestHash, token_hash: documentMailHash(token),
    state: "preparing", customer_name: customerName, recipient_email: to, subject, expires_at: expiresAt, ...ids, quote_id: quoteId ?? null,
    contract_version_at: selectedContract?.choice.version ?? null,
  });
  if (createError?.code === "23505") throw new DocumentMailError("이미 발송을 준비하고 있습니다.", 409, "IN_PROGRESS");
  if (createError) throw createError;

  const bucket = db.storage.from(DOCUMENT_MAIL_BUCKET);
  const uploaded: string[] = [];
  async function markFailed() {
    const { error } = await db.from(DOCUMENT_MAIL_TABLE).update({ state: "failed" }).eq("id", id).in("state", ["preparing", "sending"]);
    if (error) { console.error("[document-mail] failure state update", error.code); return; }
    if (uploaded.length) {
      const removal = await bucket.remove(uploaded);
      if (removal.error) console.error("[document-mail] draft PDF cleanup", removal.error.name);
    }
  }

  async function prepare(context?: BrowserContext) {
    const results = await Promise.allSettled(records.map(async ({ choice, row, signed }) => {
      const { kind, title, number } = choice;
      const document: DeliveredDocument = { kind, title, number, path: `${id}/${kind}.pdf` };
      if (signed) {
        return { document: { ...document, path: signed.signed_pdf_path, signed: { name: signed.signer_name, at: signed.signed_at } } };
      }
      let pdf: Buffer;
      let contractHtml: string | undefined;
      if (kind === "quote") {
        pdf = (await renderQuoteBuffer(row, "pdf", { baseUrl, context })).buffer;
      } else if (kind === "statement") {
        pdf = await statementPdf(db, row as unknown as TransactionStatement, context);
      } else {
        contractHtml = buildContractHtmlFromRow(row, { baseUrl, customerSignaturePlaceholders: true });
        if (!contractHtml) throw new DocumentMailError("계약서 PDF를 만들 수 없습니다.", 422, "NOT_SENT");
        pdf = await renderA4HtmlPdf(contractHtml, { context });
      }
      const { error } = await bucket.upload(document.path, pdf, { contentType: "application/pdf", upsert: false });
      if (error) throw error;
      uploaded.push(document.path);
      return { document, contractHtml, contractHash: contractHtml ? documentMailHash(pdf) : undefined };
    }));
    return results.map((result) => {
      if (result.status === "rejected") throw result.reason;
      return result.value;
    });
  }

  const preparationStartedAt = Date.now();
  let documents: DeliveredDocument[];
  let contractHtml: string | null;
  try {
    const needsBrowser = records.some(({ choice, row, signed }) =>
      !signed && (choice.kind !== "statement" || !archivedStatementPdf(row as unknown as TransactionStatement)));
    const prepared = needsBrowser ? await withDocumentPdfContext(prepare) : await prepare();
    documents = prepared.map(({ document }) => document);
    const contract = prepared.find(({ contractHtml }) => contractHtml);
    contractHtml = contract?.contractHtml ?? null;
    await Promise.all(records.map((record) => assertCurrentVersion(db, record)));
    const { data, error } = await db.from(DOCUMENT_MAIL_TABLE)
      .update({ state: "sending", documents, contract_html: contractHtml, contract_sha256: contract?.contractHash ?? null })
      .eq("id", id).eq("state", "preparing").select("id").maybeSingle();
    if (error || !data) throw error || new Error("Mail state update failed");
  } catch (error) {
    await markFailed();
    if (error instanceof DocumentMailError) throw error;
    console.error("[document-mail] PDF preparation failed", error instanceof Error ? error.name : "database");
    throw new DocumentMailError("메일을 보내기 전에 PDF를 준비하지 못했습니다. 잠시 후 다시 시도해 주세요.", 502, "NOT_SENT");
  }

  const mailStartedAt = Date.now();
  const portalUrl = new URL(receivedDocumentsPath(token), baseUrl);
  try {
    const result = await transport.client.sendMail({
      from: { name: process.env.GMAIL_FROM_NAME || CONTRACT_BRAND_CONFIG[brand].label, address: transport.user },
      to, subject,
      ...documentMailBody({ brand, message, documents, portalUrl, requiresSignature: Boolean(contractHtml) }),
    });
    if (!result.accepted?.length) throw Object.assign(new Error("Mail recipient rejected"), { code: "EENVELOPE" });
  } catch (error) {
    const smtp = error as { code?: string; responseCode?: number };
    if (smtp.code === "EAUTH" || smtp.code === "EENVELOPE" || (smtp.responseCode && smtp.responseCode >= 400)) {
      await markFailed();
      throw new DocumentMailError("메일 서버가 발송을 거절했습니다. 받는 주소와 메일 설정을 확인해 주세요.", 502, "NOT_SENT");
    }
    console.error("[document-mail] SMTP outcome uncertain", smtp.code);
    throw new DocumentMailError("메일 서버의 발송 결과를 확인하지 못했습니다. 발송 상태를 확인해 주세요.", 502, "UNCONFIRMED");
  }

  const sentAt = new Date().toISOString();
  console.info("[document-mail] accepted", {
    documentCount: documents.length, preparationMs: mailStartedAt - preparationStartedAt, smtpMs: Date.now() - mailStartedAt,
  });
  for (let attempt = 0; attempt < 2; attempt++) {
    const result = await db.from(DOCUMENT_MAIL_TABLE).update({ state: "sent", sent_at: sentAt }).eq("id", id);
    if (!result.error) return { sentAt, documentCount: documents.length };
  }
  console.error("[document-mail] mail sent but record update failed", id);
  return { sentAt, documentCount: documents.length, recordingWarning: "메일을 보냈습니다. 발송 기록 업데이트를 확인해 주세요." };
}
