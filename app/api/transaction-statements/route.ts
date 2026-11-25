import type { NextRequest } from "next/server";
import { isAdminSession } from "@/lib/passkey";
import { createTransactionStatement, statementErrorResponse } from "@/lib/quote/transactionStatementStore";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  if (!isAdminSession(request)) {
    return Response.json({ ok: false, error: "관리자 로그인이 필요합니다." }, { status: 401 });
  }
  const body = await request.json().catch(() => null);
  try {
    const { id, statement_number, status } = await createTransactionStatement(
      typeof body?.quoteId === "string" ? body.quoteId : "",
    );
    return Response.json({ ok: true, statement: { id, statement_number, status } }, { status: 201 });
  } catch (error) {
    return statementErrorResponse(error);
  }
}
