import { NEGATIVE_MUTATION_PATTERN } from "./mutationIntentGuard";

const DOCUMENT = /거래\s*명세서/u;
const CREATE = /(?:만들|생성|작성|전환|바꿔)/u;
const QUOTE_NUMBER = /\b(?:PCQ?|JKQ|JI|Q)-\d{8}-\d{2,6}\b/i;

export function statementChatRequest(message: string) {
  const text = message.trim().normalize("NFC");
  if (NEGATIVE_MUTATION_PATTERN.test(text) || /(?:만들지|바꾸지)\s*마/u.test(text) || !CREATE.test(text)) return null;
  const keyword = text.match(DOCUMENT);
  if (keyword?.index === undefined) return null;
  const before = text.slice(0, keyword.index);
  const after = text.slice(keyword.index + keyword[0].length);
  if (!CREATE.test(after) && !/거래\s*명세서(?:로|를)?\s*[.!?]?$/u.test(text)) return null;
  const quoteNumber = text.match(QUOTE_NUMBER)?.[0].toUpperCase() ?? null;
  const clean = (value: string) => value
    .replace(QUOTE_NUMBER, "")
    .replace(/^[\s"'“”‘’]+|[\s"'“”‘’]+$/gu, "")
    .replace(/\s*(?:의\s+)?견적(?:서)?(?:를|로|에서|로부터)?\s*$/u, "")
    .replace(/\s+승인(?:된|한)?$/u, "")
    .replace(/의$/u, "")
    .trim();
  let clientName = clean(before);
  if (!clientName) clientName = clean(after.split(CREATE)[0]?.replace(/^(?:를|로)\s*/u, "") || "");
  if (/^(?:이|그|저|해당|현재|지금|이\s*고객|그\s*고객|현재\s*고객|이\s*견적서|그\s*견적서|이\s*병원|그\s*병원|지금\s*보는\s*(?:고객|견적서))$/u.test(clientName)) clientName = "";
  return { clientName, quoteNumber };
}

export function statementQuoteNumberReply(message: string) {
  const trimmed = message.trim();
  const number = trimmed.match(QUOTE_NUMBER)?.[0];
  if (!number || !/^(?:으로|로)?\s*(?:(?:해\s*줘|선택|만들어\s*줘|진행))?\s*[.!]?$/u.test(trimmed.slice(number.length))) return null;
  return trimmed.startsWith(number) ? number.toUpperCase() : null;
}

export function statementChoiceFromHistory(
  message: string,
  history: ReadonlyArray<{ role?: string; metadata?: unknown }>,
) {
  const number = statementQuoteNumberReply(message);
  const lastAssistant = history.findLast((row) => row.role === "assistant");
  if (!number || !lastAssistant?.metadata || typeof lastAssistant.metadata !== "object") return null;
  const choice = (lastAssistant.metadata as Record<string, unknown>).statementChoice;
  if (!choice || typeof choice !== "object") return null;
  const { clientName, numbers } = choice as Record<string, unknown>;
  if (typeof clientName !== "string" || !clientName || !Array.isArray(numbers) || !numbers.includes(number)) return null;
  return `${clientName} 거래명세서 ${number}로 만들어줘`;
}
