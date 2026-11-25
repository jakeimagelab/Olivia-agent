import type { NextRequest } from "next/server";
import { isAdminSession } from "@/lib/passkey";
import { getSupabaseAdmin } from "@/lib/supabase";
import { statementPartyKey } from "@/lib/quote/transactionStatementDetails";
import { saveStatementRegistration } from "@/lib/quote/transactionStatementRegistration";
import { loadTransactionStatement, STATEMENT_BUCKET, statementErrorResponse, statementWorkspaceData, TransactionStatementError } from "@/lib/quote/transactionStatementStore";

export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: Context) {
  if (!isAdminSession(request)) return Response.json({ ok: false, error: "관리자 로그인이 필요합니다." }, { status: 401 });
  try {
    const party = statementPartyKey(request.nextUrl.searchParams.get("party"));
    if (!party) throw new TransactionStatementError("사업자를 선택해 주세요.", 400);
    const db = getSupabaseAdmin();
    const statement = await loadTransactionStatement((await context.params).id, db);
    const registration = statement?.registration_documents?.[party];
    if (!registration) throw new TransactionStatementError("첨부된 사업자등록증이 없습니다.", 404);
    const { data, error } = await db.storage.from(STATEMENT_BUCKET).download(registration.path);
    if (error || !data) throw new TransactionStatementError("사업자등록증을 열지 못했습니다.", 500);
    return new Response(data.stream(), { headers: {
      "Cache-Control": "private, no-store",
      "Content-Type": registration.contentType,
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(registration.name).replace(/'/g, "%27")}`,
      "X-Content-Type-Options": "nosniff",
    } });
  } catch (error) {
    return statementErrorResponse(error);
  }
}

export async function POST(request: NextRequest, context: Context) {
  if (!isAdminSession(request)) return Response.json({ ok: false, error: "관리자 로그인이 필요합니다." }, { status: 401 });
  try {
    const form = await request.formData().catch(() => null);
    const party = statementPartyKey(form?.get("party"));
    const file = form?.get("file");
    if (!party || !(file instanceof File)) throw new TransactionStatementError("첨부할 사업자등록증을 선택해 주세요.", 400);
    const db = getSupabaseAdmin();
    const statement = await loadTransactionStatement((await context.params).id, db);
    if (!statement) throw new TransactionStatementError("거래명세서를 찾지 못했습니다.", 404);
    if (form?.get("updatedAt") !== statement.updated_at) {
      throw new TransactionStatementError("다른 화면에서 변경했습니다. 최신 내용을 불러온 뒤 다시 첨부해 주세요.", 409);
    }
    const saved = await saveStatementRegistration(statement, party, file, db);
    return Response.json({ ok: true, statement: statementWorkspaceData(saved) });
  } catch (error) {
    return statementErrorResponse(error);
  }
}
