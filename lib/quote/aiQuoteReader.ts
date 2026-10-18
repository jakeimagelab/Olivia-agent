import Anthropic from "@anthropic-ai/sdk";
import { DEFAULT_CLAUDE_MODEL } from "@/lib/ai/claudeModel";
import { correctedEmail, type ParsedQuoteRequest } from "@/lib/quote/quoteRequestParser";
import { QUOTE_READING_RULES } from "@/lib/quote/quoteReadingRules";

export type QuoteReadingItem = {
  name: string;
  details: string[];
  amount: number | null;
  quantity: number;
  free: boolean;
};

export type QuoteReading = {
  clientName: string | null;
  titleTopic: string | null;
  isEvent: boolean;
  contactName: string | null;
  phone: string | null;
  email: string | null;
  blankContact: boolean;
  shootDate: string | null;
  items: QuoteReadingItem[];
  fixedTotal: number | null;
  itemPricesHidden: boolean;
  vatIncluded: boolean;
  depositRate: number | null;
  discount: { label: string | null; type: "percent" | "amount"; value: number } | null;
  roundDownUnit: number | null;
  brandExplicit: "photoclinic" | "jakeimage" | null;
  unreadLines: string[];
  uncertain: string[];
};

const TOOL_NAME = "save_quote_reading";
export type QuoteReaderFailureCode =
  | "NO_API_KEY"
  | "MODEL_NOT_FOUND"
  | "TIMEOUT"
  | "TOOL_NOT_CALLED"
  | "SCHEMA_ERROR"
  | `API_ERROR${string}`;

export class QuoteReaderError extends Error {
  constructor(public readonly code: QuoteReaderFailureCode, message: string, public readonly status?: number) {
    super(message);
    this.name = "QuoteReaderError";
  }
}

export function quoteReaderModel() {
  return process.env.OLIVIA_QUOTE_READER_MODEL?.trim() || DEFAULT_CLAUDE_MODEL;
}

export function quoteReaderFailureDetails(error: unknown): { code: QuoteReaderFailureCode; label: string; status?: number } {
  if (error instanceof QuoteReaderError) {
    const labels: Partial<Record<QuoteReaderFailureCode, string>> = {
      NO_API_KEY: "API 키 없음",
      MODEL_NOT_FOUND: "모델을 찾지 못함",
      TIMEOUT: "시간 초과",
      TOOL_NOT_CALLED: "판독 도구 응답 없음",
      SCHEMA_ERROR: "응답 형식 오류",
    };
    return { code: error.code, label: labels[error.code] || `API 오류${error.status ? ` ${error.status}` : ""}`, ...(error.status ? { status: error.status } : {}) };
  }
  const candidate = object(error);
  const status = typeof candidate.status === "number" ? candidate.status : undefined;
  const message = error instanceof Error ? error.message : String(error ?? "");
  if (status === 404 || /model.*(?:not found|없)|not_found_error/i.test(message)) {
    return { code: "MODEL_NOT_FOUND", label: "모델을 찾지 못함", ...(status ? { status } : {}) };
  }
  if (/timeout|timed out|시간 초과|aborted/i.test(message) || candidate.name === "AbortError") {
    return { code: "TIMEOUT", label: "시간 초과", ...(status ? { status } : {}) };
  }
  return { code: `API_ERROR${status ? `(${status})` : ""}`, label: `API 오류${status ? ` ${status}` : ""}`, ...(status ? { status } : {}) };
}

const TOOL = {
  name: TOOL_NAME,
  description: "견적 요청 원문에서 확인되는 값만 구조화해 저장합니다.",
  input_schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      clientName: { type: ["string", "null"] },
      titleTopic: { type: ["string", "null"] },
      isEvent: { type: "boolean" },
      contactName: { type: ["string", "null"] },
      phone: { type: ["string", "null"] },
      email: { type: ["string", "null"] },
      blankContact: { type: "boolean" },
      shootDate: { type: ["string", "null"] },
      items: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            name: { type: "string" }, details: { type: "array", items: { type: "string" } },
            amount: { type: ["number", "null"] }, quantity: { type: "number" }, free: { type: "boolean" },
          },
          required: ["name", "details", "amount", "quantity", "free"],
        },
      },
      fixedTotal: { type: ["number", "null"] }, itemPricesHidden: { type: "boolean" }, vatIncluded: { type: "boolean" },
      depositRate: { type: ["number", "null"] },
      discount: {
        anyOf: [
          { type: "null" },
          { type: "object", additionalProperties: false, properties: { label: { type: ["string", "null"] }, type: { type: "string", enum: ["percent", "amount"] }, value: { type: "number" } }, required: ["label", "type", "value"] },
        ],
      },
      roundDownUnit: { type: ["number", "null"] },
      brandExplicit: { anyOf: [{ type: "null" }, { type: "string", enum: ["photoclinic", "jakeimage"] }] },
      unreadLines: { type: "array", items: { type: "string" } }, uncertain: { type: "array", items: { type: "string" } },
    },
    required: ["clientName", "titleTopic", "isEvent", "contactName", "phone", "email", "blankContact", "shootDate", "items", "fixedTotal", "itemPricesHidden", "vatIncluded", "depositRate", "discount", "roundDownUnit", "brandExplicit", "unreadLines", "uncertain"],
  },
} as const;

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function nullableString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function nullableNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function isNullableString(value: unknown) {
  return value === null || typeof value === "string";
}

function isNullableNumber(value: unknown) {
  return value === null || (typeof value === "number" && Number.isFinite(value));
}

function hasValidReadingSchema(value: unknown) {
  const raw = object(value);
  const required = [
    "clientName", "titleTopic", "isEvent", "contactName", "phone", "email", "blankContact",
    "shootDate", "items", "fixedTotal", "itemPricesHidden", "vatIncluded", "depositRate",
    "discount", "roundDownUnit", "brandExplicit", "unreadLines", "uncertain",
  ];
  if (!required.every((key) => Object.prototype.hasOwnProperty.call(raw, key))) return false;
  if (![raw.clientName, raw.titleTopic, raw.contactName, raw.phone, raw.email, raw.shootDate].every(isNullableString)) return false;
  if (![raw.isEvent, raw.blankContact, raw.itemPricesHidden, raw.vatIncluded].every((entry) => typeof entry === "boolean")) return false;
  if (![raw.fixedTotal, raw.depositRate, raw.roundDownUnit].every(isNullableNumber)) return false;
  if (raw.brandExplicit !== null && raw.brandExplicit !== "photoclinic" && raw.brandExplicit !== "jakeimage") return false;
  if (!Array.isArray(raw.unreadLines) || !raw.unreadLines.every((entry) => typeof entry === "string")) return false;
  if (!Array.isArray(raw.uncertain) || !raw.uncertain.every((entry) => typeof entry === "string")) return false;
  if (!Array.isArray(raw.items) || !raw.items.every((entry) => {
    const item = object(entry);
    return typeof item.name === "string"
      && Array.isArray(item.details) && item.details.every((detail) => typeof detail === "string")
      && isNullableNumber(item.amount)
      && typeof item.quantity === "number" && Number.isFinite(item.quantity)
      && typeof item.free === "boolean";
  })) return false;
  if (raw.discount !== null) {
    const discount = object(raw.discount);
    if (!isNullableString(discount.label)
      || (discount.type !== "percent" && discount.type !== "amount")
      || typeof discount.value !== "number" || !Number.isFinite(discount.value)) return false;
  }
  return true;
}

export function quoteReadingFromUnknown(value: unknown): QuoteReading {
  const raw = object(value);
  const rawDiscount = object(raw.discount);
  const discountType = rawDiscount.type === "percent" || rawDiscount.type === "amount" ? rawDiscount.type : null;
  const discountValue = nullableNumber(rawDiscount.value);
  return {
    clientName: nullableString(raw.clientName), titleTopic: nullableString(raw.titleTopic), isEvent: raw.isEvent === true,
    contactName: nullableString(raw.contactName), phone: nullableString(raw.phone), email: nullableString(raw.email), blankContact: raw.blankContact === true,
    shootDate: nullableString(raw.shootDate),
    items: Array.isArray(raw.items) ? raw.items.flatMap((entry) => {
      const item = object(entry); const name = nullableString(item.name); if (!name) return [];
      return [{ name, details: Array.isArray(item.details) ? item.details.filter((detail): detail is string => typeof detail === "string") : [], amount: nullableNumber(item.amount), quantity: Math.max(1, Math.floor(nullableNumber(item.quantity) ?? 1)), free: item.free === true }];
    }) : [],
    fixedTotal: nullableNumber(raw.fixedTotal), itemPricesHidden: raw.itemPricesHidden === true, vatIncluded: raw.vatIncluded === true,
    depositRate: nullableNumber(raw.depositRate),
    discount: discountType && discountValue !== null ? { label: nullableString(rawDiscount.label), type: discountType, value: discountValue } : null,
    roundDownUnit: nullableNumber(raw.roundDownUnit),
    brandExplicit: raw.brandExplicit === "photoclinic" || raw.brandExplicit === "jakeimage" ? raw.brandExplicit : null,
    unreadLines: Array.isArray(raw.unreadLines) ? raw.unreadLines.filter((line): line is string => typeof line === "string") : [],
    uncertain: Array.isArray(raw.uncertain) ? raw.uncertain.filter((line): line is string => typeof line === "string") : [],
  };
}

export async function readQuoteRequestWithAI(input: { text: string; today: string }): Promise<QuoteReading> {
  if (!process.env.ANTHROPIC_API_KEY) throw new QuoteReaderError("NO_API_KEY", "ANTHROPIC_API_KEY가 없습니다.");
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, timeout: 45_000, maxRetries: 1 });
  try {
    const response = await client.messages.create({
      model: quoteReaderModel(),
      max_tokens: 4000,
      temperature: 0,
      system: `${QUOTE_READING_RULES}\n\n기준일(서울): ${input.today}`,
      messages: [{ role: "user", content: input.text }],
      tools: [TOOL],
      tool_choice: { type: "tool", name: TOOL_NAME },
    });
    const use = response.content.find((block) => block.type === "tool_use" && block.name === TOOL_NAME);
    if (!use || use.type !== "tool_use") throw new QuoteReaderError("TOOL_NOT_CALLED", "AI가 견적 판독 결과를 반환하지 않았습니다.");
    if (!hasValidReadingSchema(use.input)) {
      throw new QuoteReaderError("SCHEMA_ERROR", "AI 견적 판독 응답 형식이 올바르지 않습니다.");
    }
    return quoteReadingFromUnknown(use.input);
  } catch (error) {
    if (error instanceof QuoteReaderError) throw error;
    const details = quoteReaderFailureDetails(error);
    throw new QuoteReaderError(details.code, error instanceof Error ? error.message : details.label, details.status);
  }
}

function normalizedText(value: string) {
  return value.normalize("NFC").toLocaleLowerCase("ko-KR").replace(/[^가-힣a-z0-9@.]/gi, "");
}

function appearsInText(value: string, text: string) {
  return normalizedText(text).includes(normalizedText(value));
}

function moneyValues(text: string) {
  const values = new Set<number>();
  for (const match of text.matchAll(/(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)\s*(만원|만|원|%)?/g)) {
    const number = Number(match[1].replaceAll(",", ""));
    if (!Number.isFinite(number)) continue;
    values.add(number);
    if (match[2] === "만원" || match[2] === "만") values.add(Math.round(number * 10_000));
    else if (match[2] === "원") values.add(Math.round(number));
    else if (!match[2]) values.add(Math.round(number * 10_000));
  }
  const balance = /잔금\s*(\d+(?:\.\d+)?)\s*%/g;
  for (const match of text.matchAll(balance)) values.add(100 - Number(match[1]));
  return values;
}

export function verifyReadingAgainstText(reading: QuoteReading, text: string): QuoteReading {
  const next = quoteReadingFromUnknown(reading);
  const uncertain = [...next.uncertain];
  const invalidateText = (label: string, value: string | null) => {
    if (!value || appearsInText(value, text)) return value;
    uncertain.push(`원문에 없는 값이라 비웠어요: ${label} ${value}`);
    return null;
  };
  next.clientName = invalidateText("고객명", next.clientName);
  next.contactName = invalidateText("담당자", next.contactName);
  next.items = next.items.filter((item) => {
    if (appearsInText(item.name, text)) return true;
    uncertain.push(`원문에 없는 값이라 비웠어요: 항목 ${item.name}`); return false;
  });
  const numbers = moneyValues(text);
  const verifiedNumber = (label: string, value: number | null) => {
    if (value === null || value === 0 || numbers.has(value)) return value;
    uncertain.push(`원문에 없는 값이라 비웠어요: ${label} ${value}`); return null;
  };
  next.items = next.items.map((item) => ({ ...item, amount: verifiedNumber(`${item.name} 금액`, item.amount) }));
  next.fixedTotal = verifiedNumber("총액", next.fixedTotal);
  next.depositRate = verifiedNumber("선금 비율", next.depositRate);
  if (next.discount) {
    const checked = verifiedNumber("할인", next.discount.value);
    next.discount = checked === null ? null : { ...next.discount, value: checked };
  }
  next.uncertain = [...new Set(uncertain)];
  return next;
}

export function toParsedQuoteRequest(reading: QuoteReading): ParsedQuoteRequest {
  const mail = reading.email ? correctedEmail(reading.email) : null;
  return {
    clientName: reading.clientName, titleSuffix: reading.titleTopic, isEvent: reading.isEvent,
    contactName: reading.contactName, phone: reading.blankContact ? null : reading.phone,
    email: reading.blankContact ? null : mail?.email ?? reading.email,
    emailCorrectedFrom: reading.blankContact ? null : mail?.correctedFrom ?? null,
    items: reading.items.map((item) => ({ ...item, note: null, groupLabel: null, amount: item.free ? 0 : item.amount })),
    discount: reading.discount, fixedTotal: reading.fixedTotal, roundDownUnit: reading.roundDownUnit,
    checkTotal: null, shootDate: reading.shootDate, itemPricesHidden: reading.itemPricesHidden,
    taxMode: reading.vatIncluded ? "included" : "separate", vatIncluded: reading.vatIncluded,
    depositRate: reading.depositRate, memo: null, unparsedLines: reading.unreadLines,
  };
}

export function quoteReadingFromParsedRequest(parsed: ParsedQuoteRequest): QuoteReading {
  return {
    clientName: parsed.clientName, titleTopic: parsed.titleSuffix, isEvent: parsed.isEvent,
    contactName: parsed.contactName, phone: parsed.phone, email: parsed.email, blankContact: !parsed.phone && !parsed.email,
    shootDate: parsed.shootDate,
    items: parsed.items.map(({ name, details, amount, quantity, free }) => ({ name, details, amount, quantity, free })),
    fixedTotal: parsed.fixedTotal, itemPricesHidden: parsed.itemPricesHidden, vatIncluded: parsed.taxMode === "included",
    depositRate: parsed.depositRate, discount: parsed.discount, roundDownUnit: parsed.roundDownUnit,
    brandExplicit: null, unreadLines: parsed.unparsedLines, uncertain: [],
  };
}
