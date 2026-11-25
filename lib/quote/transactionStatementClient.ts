import type { StatementSummary, StatementWorkspaceData } from "./transactionStatementDetails";

export async function statementRequest<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { cache: "no-store", ...init });
  const result = await response.json().catch(() => null) as (T & { ok?: boolean; error?: string }) | null;
  if (!response.ok || !result?.ok) throw new Error(result?.error || "거래명세서 요청을 처리하지 못했습니다.");
  return result;
}

export function loadQuoteStatements(quoteId: string, signal?: AbortSignal) {
  return statementRequest<{ statements: StatementSummary[] }>(`/api/transaction-statements?quoteId=${encodeURIComponent(quoteId)}`, { signal });
}

export function createQuoteStatement(quoteId: string) {
  return statementRequest<{ statement: StatementSummary }>("/api/transaction-statements", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ quoteId }),
  });
}

export type StatementWorkspaceResponse = { statement: StatementWorkspaceData };

export async function loadStatementPdf(url: string, signal?: AbortSignal) {
  const response = await fetch(url, { cache: "no-store", signal });
  if (!response.ok || !response.headers.get("Content-Type")?.startsWith("application/pdf")) {
    const error = await response.json().catch(() => null);
    throw new Error(error?.error || "거래명세서 PDF를 열지 못했습니다.");
  }
  return response.blob();
}
