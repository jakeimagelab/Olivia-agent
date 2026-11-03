export type QuoteEditorLoadState = "idle" | "loading" | "ready" | "error";

export type QuoteEditorSession = {
  mode: "new" | "existing";
  quoteId: string | null;
  clientId: string | null;
  workflowRunId: string | null;
  quoteNumber: string;
  updatedAt: string | null;
  loadState: QuoteEditorLoadState;
  requestToken: number;
};

export type LoadedQuoteIdentity = {
  id: string;
  clientId: string | null;
  workflowRunId: string | null;
  quoteNumber: string;
  updatedAt: string | null;
};

export function createNewQuoteSession(input: {
  clientId?: string | null;
  workflowRunId?: string | null;
  quoteNumber?: string;
} = {}): QuoteEditorSession {
  return {
    mode: "new",
    quoteId: null,
    clientId: input.clientId ?? null,
    workflowRunId: input.workflowRunId ?? null,
    quoteNumber: input.quoteNumber ?? "",
    updatedAt: null,
    loadState: "ready",
    requestToken: 0,
  };
}

export function beginExistingQuoteLoad(session: QuoteEditorSession, quoteId: string): QuoteEditorSession {
  return {
    mode: "existing",
    quoteId,
    clientId: null,
    workflowRunId: null,
    quoteNumber: "",
    updatedAt: null,
    loadState: "loading",
    requestToken: session.requestToken + 1,
  };
}

export function completeExistingQuoteLoad(
  session: QuoteEditorSession,
  requestToken: number,
  quote: LoadedQuoteIdentity,
): QuoteEditorSession | null {
  if (
    session.mode !== "existing"
    || session.loadState !== "loading"
    || session.requestToken !== requestToken
    || session.quoteId !== quote.id
  ) return null;

  return {
    ...session,
    clientId: quote.clientId,
    workflowRunId: quote.workflowRunId,
    quoteNumber: quote.quoteNumber,
    updatedAt: quote.updatedAt,
    loadState: "ready",
  };
}

export function failExistingQuoteLoad(
  session: QuoteEditorSession,
  requestToken: number,
  quoteId: string,
): QuoteEditorSession | null {
  if (
    session.mode !== "existing"
    || session.requestToken !== requestToken
    || session.quoteId !== quoteId
  ) return null;
  return { ...session, loadState: "error" };
}

export function isSameQuoteSession(current: QuoteEditorSession, expected: QuoteEditorSession) {
  return current.requestToken === expected.requestToken
    && current.mode === expected.mode
    && current.quoteId === expected.quoteId;
}

export function canApplyClientPrefill(session: QuoteEditorSession, requestToken: number) {
  return session.mode === "new"
    && session.quoteId === null
    && session.loadState === "ready"
    && session.requestToken === requestToken;
}

export function quoteSaveIdentity(session: QuoteEditorSession) {
  return {
    quoteId: session.quoteId,
    clientId: session.clientId,
    workflowRunId: session.workflowRunId,
    lastKnownUpdatedAt: session.updatedAt,
  };
}
