export type WorkspaceQuoteCandidate = {
  id: string;
  status: string | null;
};

export type WorkspaceQuoteSelection = {
  quote: WorkspaceQuoteCandidate | null;
  meta: { status: string; isApproved: boolean } | null;
};

export const APPROVED_QUOTE_STATUSES = new Set(["published", "final"]);

export function selectWorkspaceQuote(
  approvedQuote: WorkspaceQuoteCandidate | null | undefined,
  latestQuote: WorkspaceQuoteCandidate | null | undefined,
): WorkspaceQuoteSelection {
  const quote = approvedQuote ?? latestQuote ?? null;
  if (!quote) return { quote: null, meta: null };
  const status = quote.status ?? "draft";
  return {
    quote,
    meta: { status, isApproved: APPROVED_QUOTE_STATUSES.has(status) },
  };
}
