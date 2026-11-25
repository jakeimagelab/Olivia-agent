import { statementPdfResponse } from "@/lib/quote/renderTransactionStatementPdf";
import { statementReceiptTokenHash } from "@/lib/quote/transactionStatementReceipt";
import { loadStatementByReceiptHash, statementErrorResponse, TransactionStatementError } from "@/lib/quote/transactionStatementStore";
import { getSupabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";
type Context = { params: Promise<{ token: string }> };

export async function GET(_request: Request, { params }: Context) {
  try {
    const hash = statementReceiptTokenHash((await params).token);
    const statement = hash ? await loadStatementByReceiptHash(hash) : null;
    if (!statement) throw new TransactionStatementError("거래명세서 확인 링크가 유효하지 않습니다.", 404);
    return await statementPdfResponse(statement);
  } catch (error) {
    return statementErrorResponse(error);
  }
}

export async function POST(request: Request, { params }: Context) {
  const body = await request.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name.trim().replace(/\s+/gu, " ") : "";
  if (!name || name.length > 80) {
    return Response.json({ ok: false, error: "확인하신 분의 이름을 80자 이내로 입력해 주세요." }, { status: 400 });
  }
  try {
    const hash = statementReceiptTokenHash((await params).token);
    if (!hash) throw new TransactionStatementError("거래명세서 확인 링크가 유효하지 않습니다.", 404);
    const db = getSupabaseAdmin();
    const confirmedAt = new Date().toISOString();
    const { data, error } = await db.from("transaction_statements")
      .update({ status: "confirmed", confirmed_at: confirmedAt, confirmed_by: name, updated_at: confirmedAt })
      .eq("receipt_token_hash", hash).eq("status", "sent")
      .select("confirmed_at,confirmed_by").maybeSingle();
    if (error) throw new TransactionStatementError("수신확인을 저장하지 못했습니다.", 500);
    if (data) return Response.json({ ok: true, confirmedAt: data.confirmed_at, confirmedBy: data.confirmed_by });
    const statement = await loadStatementByReceiptHash(hash, db);
    if (statement?.status === "confirmed") {
      return Response.json({ ok: true, confirmedAt: statement.confirmed_at, confirmedBy: statement.confirmed_by });
    }
    throw new TransactionStatementError("거래명세서 확인 링크가 유효하지 않습니다.", 404);
  } catch (error) {
    return statementErrorResponse(error);
  }
}
