import type { ConversationMessage } from "@/lib/olivia/v2/stream/contextPrompt";

const QUOTE_RETRY = /(?:견적|견적서).*(?:다시|재시도|한번\s*더)/i;
const QUOTE_CREATE_VERB = /(만들|작성|뽑|부탁|해줘|생성)/i;
const QUOTE_NON_CREATE = /(찾아|열어|보여|보내|삭제|수정해)/i;
const QUOTE_ITEM_WORD = /(프로필|연출|컨셉|인테리어|외관|영상|스케치|단체|패키지|촬영|서비스|혜택)/i;
const MONEY = /\d[\d,.]*\s*(?:만원|만|원|%)/;

export type DirectQuoteRequest =
  | { kind: "create"; requestText: string; retry: boolean }
  | { kind: "retry_missing" }
  | { kind: "none" };

/** A short retry points backwards; it must not become a new customer or quote body. */
export function isQuoteRetryRequest(text: string) {
  const remainder = text
    .replace(/견적서?|요청|위|그|것|다시|재시도|한번\s*더|만들어|만들어줘|해봐|해줘|해주세요|\s|[.!?~]/gi, "");
  return QUOTE_RETRY.test(text) && !QUOTE_ITEM_WORD.test(remainder) && !MONEY.test(text);
}

export function isQuoteCreationRequest(text: string) {
  const trimmed = text.trim();
  if (!trimmed || isQuoteRetryRequest(trimmed)) return false;
  const firstLine = trimmed.split(/\r?\n/).find((line) => line.trim())?.trim() || "";
  if (trimmed.includes("\n") && /견적서/.test(firstLine)) return true;
  return /견적/.test(trimmed) && QUOTE_CREATE_VERB.test(trimmed) && !QUOTE_NON_CREATE.test(trimmed);
}

export function resolveDirectQuoteRequest(
  currentText: string,
  history: Array<Pick<ConversationMessage, "role" | "content">>,
): DirectQuoteRequest {
  if (isQuoteRetryRequest(currentText)) {
    for (let index = history.length - 1; index >= 0; index -= 1) {
      const row = history[index];
      if (row.role !== "user") continue;
      const requestText = String(row.content || "").trim();
      if (isQuoteCreationRequest(requestText)) return { kind: "create", requestText, retry: true };
    }
    return { kind: "retry_missing" };
  }

  return isQuoteCreationRequest(currentText)
    ? { kind: "create", requestText: currentText, retry: false }
    : { kind: "none" };
}

export function isDirectQuoteCandidate(text: string) {
  return isQuoteCreationRequest(text) || isQuoteRetryRequest(text);
}

export function isQuoteCreationTurn(text: string) {
  return isDirectQuoteCandidate(text);
}
