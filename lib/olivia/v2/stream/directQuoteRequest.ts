import { parseQuoteRequest, quoteCreationTargetFromRequest } from "@/lib/quote/quoteRequestParser";
import type { ConversationMessage } from "@/lib/olivia/v2/stream/contextPrompt";

const QUOTE_RETRY = /(?:견적|견적서).*(?:다시|재시도|한번\s*더|다시\s*만들어|다시\s*해)/i;
const QUOTE_CREATE = /(?:견적|견적서).*(?:만들어|작성해|뽑아|부탁)|(?:만들어|작성해|뽑아|부탁).*(?:견적|견적서)/i;
const QUOTE_ITEM_WORD = /(프로필|연출|컨셉|인테리어|외관|영상|스케치|단체|패키지|촬영)/i;
const MONEY = /\d[\d,.]*\s*(?:만원|만|원|%)/;

export type DirectQuoteRequest =
  | { kind: "create"; requestText: string; clientName: string; retry: boolean }
  | { kind: "retry_missing" }
  | { kind: "missing_client" }
  | { kind: "none" };

/** A short retry points backwards; it must not become a new customer or quote body. */
export function isQuoteRetryRequest(text: string) {
  const remainder = text
    .replace(/견적서?|요청|위|그|것|다시|재시도|한번\s*더|만들어|만들어줘|해봐|해줘|해주세요|\s|[.!?~]/gi, "");
  return QUOTE_RETRY.test(text) && !QUOTE_ITEM_WORD.test(remainder) && !MONEY.test(text);
}

function hasQuotePayloadWithoutClient(text: string) {
  if (!QUOTE_CREATE.test(text)) return false;
  const parsed = parseQuoteRequest(text);
  return !parsed.clientName && (parsed.items.length > 0 || parsed.fixedTotal !== null);
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
      const clientName = quoteCreationTargetFromRequest(requestText);
      if (clientName) return { kind: "create", requestText, clientName, retry: true };
    }
    return { kind: "retry_missing" };
  }

  const clientName = quoteCreationTargetFromRequest(currentText);
  if (clientName) return { kind: "create", requestText: currentText, clientName, retry: false };
  if (hasQuotePayloadWithoutClient(currentText)) return { kind: "missing_client" };
  return { kind: "none" };
}

export function isDirectQuoteCandidate(text: string) {
  return Boolean(quoteCreationTargetFromRequest(text)) || isQuoteRetryRequest(text) || hasQuotePayloadWithoutClient(text);
}

export function isQuoteCreationTurn(text: string) {
  return QUOTE_CREATE.test(text) || isQuoteRetryRequest(text);
}
