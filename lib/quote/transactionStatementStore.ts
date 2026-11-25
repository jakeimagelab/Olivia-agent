import type { SupabaseClient } from "@supabase/supabase-js";
import { APPROVED_QUOTE_STATUSES } from "@/lib/clientWorkspace/quoteSelection";
import { getSupabaseAdmin } from "@/lib/supabase";
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

const STATEMENT_COLUMNS = "id,statement_number,transaction_date,shoot_date,snapshot,status,pdf_path,confirmed_at,confirmed_by";
export const STATEMENT_BUCKET = "transaction-statements";

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
  if (!APPROVED_QUOTE_STATUSES.has(String(quote.status))) {
    throw new TransactionStatementError("거래명세서는 견적서 승인 후 만들 수 있습니다.", 409);
  }
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
    throw new TransactionStatementError(
      insertError.message === "quote_not_approved"
        ? "거래명세서는 견적서 승인 후 만들 수 있습니다."
        : "견적서가 방금 변경되었습니다. 최신 내용을 확인한 뒤 다시 만들어 주세요.",
      409,
    );
  }
  if (insertError?.code === "PT404") throw new TransactionStatementError("견적서를 찾지 못했습니다.", 404);
  if (insertError?.code === "PGRST202") {
    throw new TransactionStatementError("거래명세서 DB 설정이 필요합니다. 거래명세서 마이그레이션을 적용해 주세요.", 503);
  }
  if (insertError || !data) throw new TransactionStatementError("거래명세서를 저장하지 못했습니다.", 500);
  return { ...data, status: "draft" as const, snapshot };
}
