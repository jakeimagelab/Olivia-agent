import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import {
  prepareQuoteCreateApproval,
  resolveCreateQuoteContext,
} from "../lib/olivia/v2/toolExecutors/quote";
import { parseQuoteRequest } from "../lib/quote/quoteRequestParser";
import {
  applyCatalogPricingToParsedRequest,
  buildQuoteDataFromParsedRequest,
} from "../lib/quote/quoteRequestData";

type Exam = { id: number; text: string; today?: string; expect: Record<string, unknown> };

function resultFor(
  parsedInput: ReturnType<typeof parseQuoteRequest>,
  brand: "photoclinic" | "jakeimage",
) {
  const parsed = applyCatalogPricingToParsedRequest(parsedInput, brand);
  const data = buildQuoteDataFromParsedRequest({ request: parsed, brand });
  return {
    ...parsed,
    unreadLines: parsed.unparsedLines,
    brand,
    title: data.title,
    supplyAmount: data.totals.supplyAmount,
    vat: data.totals.vat,
    finalAmount: data.totals.finalAmount,
  };
}

async function fallbackResult(text: string) {
  const parsed = parseQuoteRequest(text);
  const context = await resolveCreateQuoteContext({
    db: {} as never,
    requestText: text,
    clientName: parsed.clientName || "",
    modelBrand: null,
  });
  return resultFor(parsed, context.brand);
}

function equalAtExpected(actual: unknown, expected: unknown): boolean {
  if (Array.isArray(expected)) {
    if (!Array.isArray(actual) || actual.length < expected.length) return false;
    return expected.every((entry, index) => equalAtExpected(actual[index], entry));
  }
  if (expected && typeof expected === "object") {
    if (!actual || typeof actual !== "object") return false;
    return Object.entries(expected).every(([key, value]) => equalAtExpected((actual as Record<string, unknown>)[key], value));
  }
  return Object.is(actual, expected);
}

async function main() {
  const here = dirname(fileURLToPath(import.meta.url));
  const exams = JSON.parse(await readFile(resolve(here, "../tests/fixtures/quote-exam.json"), "utf8")) as Exam[];
  const rows: Array<{ id: number; mode: string; pass: boolean }> = [];
  const fallbackOnly = process.argv.includes("--fallback-only");
  for (const exam of exams) {
    const fallback = await fallbackResult(exam.text);
    rows.push({ id: exam.id, mode: "fallback", pass: equalAtExpected(fallback, exam.expect) });
    for (let run = 1; !fallbackOnly && run <= 3; run += 1) {
      const prepared = await prepareQuoteCreateApproval({ requestText: exam.text, db: {} as never });
      if (prepared.fallbackNotice) {
        throw new Error(`시험지 ${exam.id} AI ${run}회차가 대체 규칙으로 처리됐습니다: ${prepared.fallbackNotice}`);
      }
      rows.push({
        id: exam.id,
        mode: `ai-${run}`,
        pass: equalAtExpected(resultFor(prepared.parsed, prepared.brand), exam.expect),
      });
    }
  }
  console.table(rows);
  const failures = rows.filter((row) => !row.pass);
  if (failures.length) process.exitCode = 1;
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
