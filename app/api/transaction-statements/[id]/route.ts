import type { NextRequest } from "next/server";
import { isAdminSession } from "@/lib/passkey";
import { normalizeStatementBusinessDetails } from "@/lib/quote/transactionStatementDetails";
import { loadTransactionStatement, statementErrorResponse, statementWorkspaceData, TransactionStatementError, updateStatementDraft } from "@/lib/quote/transactionStatementStore";

export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };

async function findStatement(context: Context) {
  const statement = await loadTransactionStatement((await context.params).id);
  if (!statement) throw new TransactionStatementError("거래명세서를 찾지 못했습니다.", 404);
  return statement;
}

export async function GET(request: NextRequest, context: Context) {
  if (!isAdminSession(request)) return Response.json({ ok: false, error: "관리자 로그인이 필요합니다." }, { status: 401 });
  try {
    const statement = statementWorkspaceData(await findStatement(context));
    return Response.json({ ok: true, statement }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return statementErrorResponse(error);
  }
}

export async function PATCH(request: NextRequest, context: Context) {
  if (!isAdminSession(request)) return Response.json({ ok: false, error: "관리자 로그인이 필요합니다." }, { status: 401 });
  try {
    const body = await request.json().catch(() => null);
    if (!body?.businessDetails?.supplier || !body.businessDetails.recipient || typeof body.updatedAt !== "string") {
      throw new TransactionStatementError("입력한 사업자 정보를 확인해 주세요.", 400);
    }
    const statement = await findStatement(context);
    if (body.updatedAt !== statement.updated_at) {
      throw new TransactionStatementError("다른 화면에서 변경했습니다. 최신 내용을 불러온 뒤 다시 저장해 주세요.", 409);
    }
    const saved = await updateStatementDraft(statement, { business_details: normalizeStatementBusinessDetails(body.businessDetails) });
    return Response.json({ ok: true, statement: statementWorkspaceData(saved) });
  } catch (error) {
    return statementErrorResponse(error);
  }
}
