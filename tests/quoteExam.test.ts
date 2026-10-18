import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseQuoteRequest } from "@/lib/quote/quoteRequestParser";
import { applyCatalogPricingToParsedRequest, buildQuoteDataFromParsedRequest } from "@/lib/quote/quoteRequestData";

type Exam = { id: number; text: string; expect: Record<string, unknown> };
const exams = JSON.parse(readFileSync(new URL("./fixtures/quote-exam.json", import.meta.url), "utf8")) as Exam[];

function brandFor(clientName: string | null) {
  return /(병원|의원|클리닉|치과|안과|내과|외과|의료|메디)/i.test((clientName || "").replace(/치과\s*교실/g, ""))
    ? "photoclinic" as const
    : "jakeimage" as const;
}

function evaluate(text: string) {
  const initial = parseQuoteRequest(text);
  const brand = brandFor(initial.clientName);
  const parsed = applyCatalogPricingToParsedRequest(initial, brand);
  const data = buildQuoteDataFromParsedRequest({ request: parsed, brand });
  return { ...parsed, unreadLines: parsed.unparsedLines, brand, title: data.title, supplyAmount: data.totals.supplyAmount, vat: data.totals.vat, finalAmount: data.totals.finalAmount };
}

describe("QUOTE_EXAM fallback rule path", () => {
  it.each(exams.map((exam) => [String(exam.id), exam] as const))("시험지 %s", (_id, exam) => {
    expect(evaluate(exam.text)).toMatchObject(exam.expect);
  });
});
