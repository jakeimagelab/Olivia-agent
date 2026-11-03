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

/** singleton 견적창에 들어온 명시적 새 작성 요청. 이전 조회·저장 응답의 토큰을 모두 무효화한다. */
export function beginNewQuoteSession(
  session: QuoteEditorSession,
  input: { clientId?: string | null; workflowRunId?: string | null; quoteNumber?: string } = {},
): QuoteEditorSession {
  return {
    ...createNewQuoteSession(input),
    requestToken: session.requestToken + 1,
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

export function quoteClientPrefillUrl(clientId: string, workflowRunId?: string | null) {
  const suffix = workflowRunId
    ? `workflowRunId=${encodeURIComponent(workflowRunId)}&strictWorkflowRunId=1`
    : "workflowMode=client-only";
  return `/api/clients/${encodeURIComponent(clientId)}?${suffix}`;
}

export function verifyQuoteClientPrefill(
  payload: { client?: { id?: string }; workflowRun?: { id?: string } | null },
  clientId: string,
  workflowRunId?: string | null,
) {
  if (payload.client?.id !== clientId) throw new Error("요청한 고객과 다른 정보가 반환됐습니다.");
  if (workflowRunId && payload.workflowRun?.id !== workflowRunId) throw new Error("요청한 촬영 건과 다른 정보가 반환됐습니다.");
  if (!workflowRunId && payload.workflowRun) throw new Error("고객 정보 조회에 촬영 건이 자동 연결됐습니다.");
  return { clientId, workflowRunId: workflowRunId ?? null };
}
