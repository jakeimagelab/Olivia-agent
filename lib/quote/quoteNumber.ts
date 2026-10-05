import type { Brand } from "@/lib/quote/quoteFormTypes";

export const QUOTE_NUMBER_START_SEQUENCE = 2;

const QUOTE_NUMBER_PREFIX: Record<Brand, string> = {
  photoclinic: "PCQ-",
  jakeimage: "JKQ-",
};

export function quoteNumberPrefixForBrand(brand: Brand) {
  return QUOTE_NUMBER_PREFIX[brand];
}

export function quoteNumberDate(value = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" })
    .format(value)
    .replaceAll("-", "");
}

export function createQuoteNumber(
  brand: Brand,
  date = quoteNumberDate(),
  sequence = QUOTE_NUMBER_START_SEQUENCE,
) {
  return `${quoteNumberPrefixForBrand(brand)}${date}-${String(Math.max(QUOTE_NUMBER_START_SEQUENCE, sequence)).padStart(4, "0")}`;
}

/** Returns the next brand/day sequence without treating historic PC-/JI-/Q- numbers as new records. */
export function nextQuoteNumber(brand: Brand, existingNumbers: readonly string[], date = quoteNumberDate()) {
  const prefix = `${quoteNumberPrefixForBrand(brand)}${date}-`;
  let highest = QUOTE_NUMBER_START_SEQUENCE - 1;
  for (const number of existingNumbers) {
    if (!number.startsWith(prefix)) continue;
    const sequence = Number(number.slice(prefix.length));
    if (Number.isInteger(sequence) && sequence >= QUOTE_NUMBER_START_SEQUENCE) highest = Math.max(highest, sequence);
  }
  return createQuoteNumber(brand, date, highest + 1);
}

export function quoteBrandFromFormState(value: unknown): Brand {
  return value && typeof value === "object" && (value as { brand?: unknown }).brand === "jakeimage"
    ? "jakeimage"
    : "photoclinic";
}
