import { createHash, randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isPcrmUuid } from "@/lib/pcrm/validation";
import { resolveStatementBusinessDetails } from "@/lib/quote/transactionStatementDetails";
import type { TransactionStatement } from "@/lib/quote/transactionStatementStore";
import { DOCUMENT_MAIL_LABELS, type DeliveredDocument, type DocumentMailChoice, type DocumentMailKind, type DocumentMailProgress, type DocumentMailReference } from "./shared";

export const DOCUMENT_MAIL_TABLE = "document_mail_deliveries";
export const DOCUMENT_MAIL_BUCKET = "document-mail";
export const DOCUMENT_MAIL_SOURCE: Record<DocumentMailKind, string> = {
  quote: "quotes", statement: "transaction_statements", contract: "contracts",
};
export const DOCUMENT_MAIL_SOURCE_ID: Record<DocumentMailKind, string> = {
  quote: "quote_id", statement: "statement_id", contract: "contract_id",
};
export const NO_DOCUMENT_CACHE = { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" };

export class DocumentMailError extends Error {
  constructor(message: string, public readonly status = 400, public readonly code?: string) {
    super(message);
  }
}

export function documentMailErrorResponse(error: unknown) {
  if (error instanceof DocumentMailError) {
    return Response.json({ ok: false, error: error.message, code: error.code }, { status: error.status, headers: NO_DOCUMENT_CACHE });
  }
  console.error("[document-mail] request failed", error instanceof Error ? error.name : "database");
  return Response.json({ ok: false, error: "문서 요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요." }, { status: 500, headers: NO_DOCUMENT_CACHE });
}

export const documentMailHash = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
export const createDocumentMailToken = () => randomBytes(32).toString("base64url");
const TOKEN = /^[A-Za-z0-9_-]{43}$/;

type SourceRow = Record<string, unknown> & {
  id: string;
  quote_number?: string | null;
  hospital_name?: string | null;
  title?: string | null;
  email?: string | null;
  client_id?: string | null;
  workflow_run_id?: string | null;
  source_quote_id?: string | null;
  quote_id?: string | null;
  updated_at?: string | null;
};

export type SignedMailContract = { signed_pdf_path: string; signed_at: string; signer_name: string };

export type DocumentMailSource = {
  choice: DocumentMailChoice;
  row: SourceRow;
  signed?: SignedMailContract;
};

export type DocumentMailDelivery = {
  id: string;
  token_hash: string;
  state: DocumentMailProgress["state"];
  customer_name: string;
  expires_at: string;
  contract_id: string | null;
  contract_html: string | null;
  contract_sha256: string | null;
  contract_version_at: string | null;
  signed_pdf_path: string | null;
  signed_at: string | null;
  signer_name: string | null;
  documents: DeliveredDocument[];
};

export async function readDocumentMailProgress(db: SupabaseClient, requestId: string): Promise<DocumentMailProgress | null> {
  if (!isPcrmUuid(requestId)) throw new DocumentMailError("발송 요청 번호를 확인해 주세요.");
  const { data, error } = await db.from(DOCUMENT_MAIL_TABLE)
    .select("state,sent_at,documents").eq("request_id", requestId).maybeSingle();
  if (error) throw error;
  return data ? { state: data.state, sentAt: data.sent_at, documentCount: data.documents?.length ?? 0 } : null;
}

export async function loadSignedMailContract(db: SupabaseClient, contractId: string): Promise<SignedMailContract | null> {
  const { data, error } = await db.from(DOCUMENT_MAIL_TABLE).select("signed_pdf_path,signed_at,signer_name")
    .eq("contract_id", contractId).not("signed_at", "is", null).maybeSingle();
  if (error?.code === "42P01" || error?.code === "PGRST205") return null;
  if (error) throw error;
  return data as SignedMailContract | null;
}

async function source(db: SupabaseClient, reference: DocumentMailReference) {
  const { data, error } = await db.from(DOCUMENT_MAIL_SOURCE[reference.kind])
    .select("*").eq("id", reference.id).maybeSingle();
  if (error) throw error;
  return data as SourceRow | null;
}

export function shareDocumentScope(quote: SourceRow, document: SourceRow, kind: "statement" | "contract") {
  const sourceQuoteId = kind === "contract" ? document.source_quote_id : document.quote_id;
  return sourceQuoteId === quote.id
    && (!quote.client_id || !document.client_id || quote.client_id === document.client_id)
    && (!quote.workflow_run_id || !document.workflow_run_id || quote.workflow_run_id === document.workflow_run_id);
}

async function describeSource(db: SupabaseClient, kind: DocumentMailKind, row: SourceRow): Promise<DocumentMailSource> {
  const statement = kind === "statement" ? row as unknown as TransactionStatement : null;
  const recipient = statement ? resolveStatementBusinessDetails(statement.snapshot, statement.business_details).recipient : null;
  const customerName = recipient?.name || row.hospital_name || "";
  const signed = kind === "contract" ? await loadSignedMailContract(db, row.id) : null;
  return {
    row: recipient ? { ...row, hospital_name: customerName, email: recipient.email } : row,
    signed: signed ?? undefined,
    choice: {
      kind, id: row.id, version: row.updated_at ?? null,
      number: statement?.statement_number || row.quote_number || "",
      title: (kind === "quote" && row.title) || `${customerName} ${DOCUMENT_MAIL_LABELS[kind]}`.trim(),
      requiresSignature: kind === "contract" && !signed,
      ...(statement?.status === "draft" && !statement.send_attempt_id ? { canRequestReceipt: true } : {}),
    },
  };
}

export async function loadDocumentMailSources(db: SupabaseClient, anchor: DocumentMailReference): Promise<DocumentMailSource[]> {
  const row = await source(db, anchor);
  if (!row) throw new DocumentMailError(`${DOCUMENT_MAIL_LABELS[anchor.kind]}를 찾을 수 없습니다.`, 404);

  const quoteId = anchor.kind === "contract" ? row.source_quote_id : row.quote_id;
  const quote = anchor.kind === "quote" ? row : quoteId ? await source(db, { kind: "quote", id: quoteId }) : null;
  if (!quote || (anchor.kind !== "quote" && !shareDocumentScope(quote, row, anchor.kind))) {
    return [await describeSource(db, anchor.kind, row)];
  }
  const list = async (kind: "statement" | "contract") => {
    const { data, error } = await db.from(DOCUMENT_MAIL_SOURCE[kind]).select("*")
      .eq(kind === "contract" ? "source_quote_id" : "quote_id", quote.id)
      .order("created_at", { ascending: false }).limit(10);
    if (error) throw error;
    const related = ((data ?? []) as SourceRow[]).filter((entry) => shareDocumentScope(quote, entry, kind));
    return kind === anchor.kind && !related.some((entry) => entry.id === row.id) ? [row, ...related] : related;
  };
  const [statements, contracts] = await Promise.all([list("statement"), list("contract")]);
  return Promise.all([
    describeSource(db, "quote", quote),
    ...statements.map((statement) => describeSource(db, "statement", statement)),
    ...contracts.map((contract) => describeSource(db, "contract", contract)),
  ]);
}

export async function loadReceivedDocuments(db: SupabaseClient, token: string): Promise<DocumentMailDelivery | null> {
  if (!TOKEN.test(token)) return null;
  const { data, error } = await db.from(DOCUMENT_MAIL_TABLE)
    .select("id,token_hash,state,customer_name,expires_at,contract_id,contract_html,contract_sha256,contract_version_at,signed_pdf_path,signed_at,signer_name,documents")
    .eq("token_hash", documentMailHash(token)).in("state", ["sending", "sent"])
    .gt("expires_at", new Date().toISOString()).maybeSingle();
  if (error) throw error;
  return data as DocumentMailDelivery | null;
}

export function visibleDeliveredDocuments(delivery: DocumentMailDelivery): DeliveredDocument[] {
  return delivery.documents.map((document) => document.kind === "contract" && delivery.signed_pdf_path && delivery.signed_at && delivery.signer_name
    ? { ...document, path: delivery.signed_pdf_path, signed: { name: delivery.signer_name, at: delivery.signed_at } }
    : document);
}

export async function documentPdfLink(db: SupabaseClient, path: string, filename?: string) {
  const { data, error } = await db.storage.from(DOCUMENT_MAIL_BUCKET)
    .createSignedUrl(path, 300, filename ? { download: filename } : undefined);
  if (error || !data?.signedUrl) throw new DocumentMailError("PDF 파일을 열 수 없습니다.", 502);
  return data.signedUrl;
}

export function receivedPdfFileName(document: DeliveredDocument) {
  const number = document.number.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 64);
  return `${DOCUMENT_MAIL_LABELS[document.kind]}${number ? `_${number}` : ""}${document.signed ? "_서명본" : ""}.pdf`;
}
