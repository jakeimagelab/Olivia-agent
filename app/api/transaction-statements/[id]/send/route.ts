import type { NextRequest } from "next/server";
import { isAdminSession } from "@/lib/passkey";
import { sendTransactionStatement } from "@/lib/quote/sendTransactionStatement";
import { statementErrorResponse } from "@/lib/quote/transactionStatementStore";

export const runtime = "nodejs";

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  if (!isAdminSession(request)) return Response.json({ error: "관리자 로그인이 필요합니다." }, { status: 401 });
  const body = await request.json().catch(() => null);
  try {
    const result = await sendTransactionStatement((await context.params).id, {
      to: body?.to,
      subject: body?.subject,
      message: body?.message,
      confirmed: body?.confirmed,
      mode: body?.mode,
      updatedAt: body?.updatedAt,
    }, request.nextUrl.origin);
    return Response.json({ ok: true, ...result });
  } catch (error) {
    return statementErrorResponse(error);
  }
}
