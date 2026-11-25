import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabase";
import { resolveStatementBusinessDetails, statementMailDefaults, type StatementReceiptMode, type StatementRegistrationDocuments, type StatementSummary, type StatementWorkspaceData, type StoredStatementBusinessDetails } from "./transactionStatementDetails";
import {
  buildTransactionStatementSnapshot,
  STATEMENT_UUID,
  type TransactionStatementSnapshot,
} from "./transactionStatementSnapshot";

export type StatementStatus = "draft" | "sent" | "confirmed";

export type TransactionStatement = {
  id: string;
  statement_number: string;
  transaction_date: string;
  shoot_date: string | null;
  snapshot: TransactionStatementSnapshot;
  status: StatementStatus;
  pdf_path: string | null;
  confirmed_at: string | null;
  confirmed_by: string | null;
  updated_at?: string;
  send_attempt_id?: string | null;
  business_details?: StoredStatementBusinessDetails;
  registration_documents?: StatementRegistrationDocuments;
  receipt_mode?: StatementReceiptMode;
  signed_pdf_path?: string | null;
};

export class TransactionStatementError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

export function statementErrorResponse(error: unknown) {
  if (error instanceof TransactionStatementError) {
    return Response.json({ ok: false, error: error.message }, { status: error.status });
  }
  console.error("[transaction-statements]", error instanceof Error ? error.message : "Unknown error");
  return Response.json({ ok: false, error: "거래명세서를 처리하지 못했습니다. 잠시 후 다시 시도해 주세요." }, { status: 500 });
}

const STATEMENT_COLUMNS = "id,statement_number,transaction_date,shoot_date,snapshot,status,pdf_path,confirmed_at,confirmed_by,updated_at,send_attempt_id,business_details,registration_documents,receipt_mode,signed_pdf_path";
export const STATEMENT_BUCKET = "transaction-statements";

export async function listTransactionStatements(quoteId: string, db = getSupabaseAdmin()): Promise<StatementSummary[]> {
  if (!STATEMENT_UUID.test(quoteId)) throw new TransactionStatementError("견적서 ID를 확인해 주세요.", 400);
  const { data, error } = await db.from("transaction_statements").select("id,statement_number,status,receipt_mode")
    .eq("quote_id", quoteId).order("created_at", { ascending: false }).limit(30);
  if (error) throw new TransactionStatementError("거래명세서 목록을 읽지 못했습니다.", 500);
  return (data ?? []) as StatementSummary[];
}

export async function loadTransactionStatement(id: string, db = getSupabaseAdmin()) {
  if (!STATEMENT_UUID.test(id)) return null;
  const { data, error } = await db.from("transaction_statements").select(STATEMENT_COLUMNS).eq("id", id).maybeSingle();
  if (error) throw new TransactionStatementError("거래명세서를 읽지 못했습니다.", 500);
  return data as TransactionStatement | null;
}

export async function loadStatementByReceiptHash(hash: string, db = getSupabaseAdmin()) {
  const { data, error } = await db.from("transaction_statements").select(STATEMENT_COLUMNS)
    .eq("receipt_token_hash", hash).in("status", ["sent", "confirmed"]).maybeSingle();
  if (error) throw new TransactionStatementError("거래명세서를 읽지 못했습니다.", 500);
  return data as TransactionStatement | null;
}

export function assertStatementEditable(statement: TransactionStatement) {
  if (statement.status !== "draft" || statement.send_attempt_id) {
    throw new TransactionStatementError("발송 중이거나 발송된 거래명세서는 수정할 수 없습니다.", 409);
  }
}

export function statementWorkspaceData(statement: TransactionStatement): StatementWorkspaceData {
  return {
    id: statement.id, number: statement.statement_number, quoteNumber: statement.snapshot.quoteNumber,
    status: statement.status, receiptMode: statement.receipt_mode ?? "confirm", updatedAt: statement.updated_at ?? "",
    confirmedAt: statement.confirmed_at, confirmedBy: statement.confirmed_by, sending: Boolean(statement.send_attempt_id),
    businessDetails: resolveStatementBusinessDetails(statement.snapshot, statement.business_details),
    registrationNames: { supplier: statement.registration_documents?.supplier?.name, recipient: statement.registration_documents?.recipient?.name },
    mailSubject: statementMailDefaults(statement).subject,
    draftPreview: statement.status === "draft" ? {
      snapshot: statement.snapshot, transactionDate: statement.transaction_date, shootDate: statement.shoot_date,
    } : null,
  };
}

export async function updateStatementDraft(
  statement: TransactionStatement,
  changes: Pick<TransactionStatement, "business_details" | "registration_documents">,
  db = getSupabaseAdmin(),
) {
  assertStatementEditable(statement);
  const revision = statement.updated_at;
  if (!revision) throw new TransactionStatementError("거래명세서 저장 시각을 읽지 못했습니다.", 500);
  const updatedAt = new Date().toISOString();
  const { data, error } = await db.from("transaction_statements").update({ ...changes, updated_at: updatedAt })
    .eq("id", statement.id).eq("status", "draft").is("send_attempt_id", null).eq("updated_at", revision)
    .select(STATEMENT_COLUMNS).maybeSingle();
  if (error) throw new TransactionStatementError("거래명세서 정보를 저장하지 못했습니다.", 500);
  if (!data) throw new TransactionStatementError("다른 화면에서 변경했습니다. 최신 내용을 불러온 뒤 다시 저장해 주세요.", 409);
  return data as TransactionStatement;
}

function validDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = new Date(value);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value ? value : null;
}

export async function createTransactionStatement(
  quoteId: string,
  db: SupabaseClient = getSupabaseAdmin(),
  now = new Date(),
) {
  if (!STATEMENT_UUID.test(quoteId)) throw new TransactionStatementError("견적서 ID를 확인해 주세요.", 400);
  const { data: quote, error } = await db.from("quotes").select("*").eq("id", quoteId).maybeSingle();
  if (error) throw new TransactionStatementError("견적서를 읽지 못했습니다.", 500);
  if (!quote) throw new TransactionStatementError("견적서를 찾지 못했습니다.", 404);
  const clientLookup = quote.client_id
    ? await db.from("clients").select("*").eq("id", quote.client_id).maybeSingle()
    : null;
  if (clientLookup?.error) throw new TransactionStatementError("고객 정보를 읽지 못했습니다.", 500);
  const snapshot = buildTransactionStatementSnapshot(quote, clientLookup?.data);
  const transactionDate = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Seoul" }).format(now);
  const { data, error: insertError } = await db.rpc("insert_transaction_statement_from_quote", {
    source_id: quoteId,
    source_version: quote.updated_at ?? null,
    statement_date: transactionDate,
    shooting_date: validDate(snapshot.document.customer.shootDate),
    statement_snapshot: snapshot,
  }).single<{ id: string; statement_number: string }>();
  if (insertError?.code === "PT409") {
    throw new TransactionStatementError("견적서가 방금 변경되었습니다. 최신 내용을 확인한 뒤 다시 만들어 주세요.", 409);
  }
  if (insertError?.code === "PT404") throw new TransactionStatementError("견적서를 찾지 못했습니다.", 404);
  if (insertError?.code === "PGRST202") {
    throw new TransactionStatementError("거래명세서 DB 설정이 필요합니다. 거래명세서 마이그레이션을 적용해 주세요.", 503);
  }
  if (insertError || !data) throw new TransactionStatementError("거래명세서를 저장하지 못했습니다.", 500);
  return { ...data, status: "draft" as const, snapshot };
}
