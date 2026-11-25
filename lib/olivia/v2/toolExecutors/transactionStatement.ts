import { createTransactionStatement, TransactionStatementError } from "@/lib/quote/transactionStatementStore";
import { transactionStatementMailPage, transactionStatementPath } from "@/lib/quote/transactionStatementSnapshot";
import { getSupabaseAdmin } from "@/lib/supabase";
import { statementChatRequest } from "../transactionStatementIntent";
import type { OliviaContextSnapshot, OliviaToolResult } from "../types";
import { createVerification } from "./verification";

export const TRANSACTION_STATEMENT_TOOL = "create_transaction_statement";
const QUOTE_COLUMNS = "id,quote_number,client_id,hospital_name,title,total_amount,quote_date,created_at";

const normalizeName = (value: string) => value.normalize("NFC").trim().toLocaleLowerCase("ko-KR").replace(/\s+/gu, "");
const likePrefix = (value: string) => `${value.replace(/[\\%_]/g, "\\$&")}%`;

export async function executeTransactionStatementTool(
  name: string,
  _input: Record<string, unknown>,
  context: OliviaContextSnapshot,
): Promise<OliviaToolResult> {
  const command = statementChatRequest(context.currentRequestText ?? "");
  const fail = (error: string, code: string, data?: Record<string, unknown>): OliviaToolResult => ({
    tool: name, success: false, code, error, data, verification: createVerification({ executed: false }),
  });
  if (!command?.clientName || command.clientName.length > 120) {
    return fail("거래명세서를 만들 고객명을 요청에 적어 주세요. 예를 들어 ‘강남스마트치과 거래명세서 만들어줘’라고 보내 주세요.", "CLIENT_NAME_REQUIRED");
  }
  if (context.canEdit === false) return fail("현재 화면에서 거래명세서를 만들 권한이 없습니다.", "PERMISSION_DENIED");
  try {
    const db = getSupabaseAdmin();
    const { clientName, quoteNumber } = command;
    const prefix = likePrefix(clientName);
    const wanted = normalizeName(clientName);
    const clients = await db.from("clients").select("id,name").ilike("name", prefix).limit(50);
    if (clients.error) throw new TransactionStatementError("고객을 조회하지 못했습니다.", 500);
    const exactClients = (clients.data ?? []).filter((client) => normalizeName(client.name || "") === wanted);
    const candidates = exactClients.length ? exactClients : clients.data ?? [];
    if (candidates.length > 1) {
      return fail(`‘${clientName}’에 해당하는 고객이 여러 곳입니다. 고객명을 정확히 입력해 주세요.`, "AMBIGUOUS_CLIENT");
    }
    const registeredClient = candidates[0];
    const baseQuery = () => {
      const query = db.from("quotes").select(QUOTE_COLUMNS);
      return quoteNumber ? query.ilike("quote_number", quoteNumber) : query;
    };
    const [withName, linked] = await Promise.all([
      baseQuery().ilike("hospital_name", likePrefix(registeredClient?.name || clientName)).order("created_at", { ascending: false }).limit(50),
      registeredClient ? baseQuery().eq("client_id", registeredClient.id).order("created_at", { ascending: false }).limit(50) : null,
    ]);
    if (withName.error || linked?.error) throw new TransactionStatementError("견적서를 조회하지 못했습니다.", 500);
    let namedQuotes = withName.data ?? [];
    if (registeredClient) {
      namedQuotes = namedQuotes.filter((quote) => !quote.client_id && normalizeName(quote.hospital_name) === normalizeName(registeredClient.name!));
    } else {
      const exact = namedQuotes.filter((quote) => normalizeName(quote.hospital_name) === wanted);
      if (exact.length) namedQuotes = exact;
      const owners = new Set(namedQuotes.map((quote) => quote.client_id || normalizeName(quote.hospital_name)));
      if (owners.size > 1) return fail(`‘${clientName}’에 해당하는 견적서의 고객이 여러 곳입니다. 고객명을 정확히 입력해 주세요.`, "AMBIGUOUS_CLIENT");
    }

    const quotes = [...(linked?.data ?? []), ...namedQuotes].sort((a, b) => b.created_at.localeCompare(a.created_at));
    if (!quotes.length) {
      return fail(quoteNumber
        ? `‘${clientName}’의 견적서에서 ${quoteNumber}를 찾지 못했습니다.`
        : `‘${clientName}’의 저장된 견적서가 없습니다.`, "QUOTE_NOT_FOUND");
    }
    if (quotes.length > 1) {
      const options = quotes.map((quote) => `- ${quote.quote_number} · ${quote.title || quote.hospital_name} · ${quote.quote_date || quote.created_at.slice(0, 10)} · ${Number(quote.total_amount).toLocaleString("ko-KR")}원`);
      return fail(`저장된 견적서가 ${quotes.length}건 있습니다. 사용할 견적서 번호를 보내 주세요.\n\n${options.join("\n")}`, "QUOTE_CHOICE_REQUIRED", {
        statementChoice: { clientName: registeredClient?.name || clientName, numbers: quotes.map((quote) => String(quote.quote_number).toUpperCase()) },
      });
    }
    const statement = await createTransactionStatement(quotes[0].id, db);
    const { document, quoteNumber: source, lines } = statement.snapshot;
    const pdfUrl = `${transactionStatementPath(statement.id)}/pdf`;
    const mailUrl = transactionStatementMailPage(statement.id);
    const summary = `견적서 ${source}의 내용으로 거래명세서 ${statement.statement_number}를 만들었습니다.\n\n품목 ${lines.length}개 · 공급가액 ${document.supplyAmount.toLocaleString("ko-KR")}원 · 세액 ${document.vat.toLocaleString("ko-KR")}원\n\n[PDF 보기](${pdfUrl}) · [메일 보내기](${mailUrl})`;
    return {
      tool: name,
      success: true,
      data: { statementId: statement.id, statementNumber: statement.statement_number, pdfUrl, mailUrl, summary },
      verification: createVerification({ executed: true, persisted: true, resourceExists: true }),
    };
  } catch (error) {
    if (error instanceof TransactionStatementError) return fail(error.message, "STATEMENT_CREATE_FAILED");
    throw error;
  }
}
