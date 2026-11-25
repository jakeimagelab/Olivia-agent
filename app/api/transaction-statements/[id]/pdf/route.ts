import type { NextRequest } from "next/server";
import { isAdminSession } from "@/lib/passkey";
import { statementPdfResponse } from "@/lib/quote/renderTransactionStatementPdf";
import { loadTransactionStatement, statementErrorResponse } from "@/lib/quote/transactionStatementStore";

export const runtime = "nodejs";

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  if (!isAdminSession(request)) return Response.json({ error: "관리자 로그인이 필요합니다." }, { status: 401 });
  try {
    const statement = await loadTransactionStatement((await context.params).id);
    if (!statement) return Response.json({ error: "거래명세서를 찾지 못했습니다." }, { status: 404 });
    return await statementPdfResponse(statement, request.nextUrl.searchParams.get("download") === "1");
  } catch (error) {
    return statementErrorResponse(error);
  }
}
