import { confirmTransactionStatement } from "@/lib/quote/confirmTransactionStatement";
import { statementPdfResponse } from "@/lib/quote/renderTransactionStatementPdf";
import { statementReceiptTokenHash } from "@/lib/quote/transactionStatementReceipt";
import { loadStatementByReceiptHash, statementErrorResponse, TransactionStatementError } from "@/lib/quote/transactionStatementStore";

export const runtime = "nodejs";
type Context = { params: Promise<{ token: string }> };

export async function GET(request: Request, { params }: Context) {
  try {
    const hash = statementReceiptTokenHash((await params).token);
    const statement = hash ? await loadStatementByReceiptHash(hash) : null;
    if (!statement) throw new TransactionStatementError("거래명세서 확인 링크가 유효하지 않습니다.", 404);
    return await statementPdfResponse(statement, new URL(request.url).searchParams.get("download") === "1");
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
    const receipt = await confirmTransactionStatement(hash, { name, signatureDataUrl: body?.signatureDataUrl, acknowledged: body?.acknowledged });
    return Response.json({ ok: true, ...receipt });
  } catch (error) {
    return statementErrorResponse(error);
  }
}
