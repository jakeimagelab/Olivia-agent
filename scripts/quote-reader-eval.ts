import { loadEnvConfig } from "@next/env";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { readQuoteRequestWithAI, toParsedQuoteRequest, verifyReadingAgainstText } from "@/lib/quote/aiQuoteReader";
import { buildQuoteDataFromParsedRequest } from "@/lib/quote/quoteRequestData";
import { resolveCreateQuoteContext } from "@/lib/olivia/v2/toolExecutors/quote";

async function main() {
  loadEnvConfig(process.cwd());
  const directory = path.join(process.cwd(), "tests", "fixtures", "quote-requests");
  const files = (await readdir(directory)).filter((name) => name.endsWith(".txt")).sort();
  let failed = 0;

  for (const file of files) {
    const stem = file.slice(0, -4);
    const [text, expectedText] = await Promise.all([
      readFile(path.join(directory, file), "utf8"),
      readFile(path.join(directory, `${stem}.expected.json`), "utf8"),
    ]);
    const expected = JSON.parse(expectedText) as Record<string, unknown>;
    const reading = verifyReadingAgainstText(await readQuoteRequestWithAI({ text, today: "2026-10-18" }), text);
    const parsed = toParsedQuoteRequest(reading);
    if (!parsed.clientName) throw new Error(`${file}: 고객명을 읽지 못했습니다.`);
    const context = await resolveCreateQuoteContext({ db: {} as never, requestText: text, clientName: parsed.clientName, modelBrand: reading.brandExplicit });
    const quote = buildQuoteDataFromParsedRequest({ request: parsed, brand: context.brand });
    const actual: Record<string, unknown> = {
      clientName: parsed.clientName, brand: context.brand, title: quote.title, contactName: parsed.contactName,
      shootDate: parsed.shootDate,
      regularItems: parsed.items.filter((item) => !item.free).map((item) => item.name),
      serviceItems: parsed.items.filter((item) => item.free).map((item) => item.name),
      supplyAmount: quote.totals.supplyAmount, vat: quote.totals.vat, finalAmount: quote.totals.finalAmount,
      depositRate: parsed.depositRate,
    };
    const rows = Object.keys(expected).map((field) => ({
      file, field, expected: JSON.stringify(expected[field]), actual: JSON.stringify(actual[field]),
      result: JSON.stringify(expected[field]) === JSON.stringify(actual[field]) ? "PASS" : "FAIL",
    }));
    console.table(rows);
    failed += rows.filter((row) => row.result === "FAIL").length;
  }

  if (failed) {
    console.error(`견적 판독 시험 실패: ${failed}개 필드`);
    process.exitCode = 1;
  } else {
    console.log(`견적 판독 시험 통과: ${files.length}개 요청`);
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
