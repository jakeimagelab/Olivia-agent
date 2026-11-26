import type { BrowserContext } from "playwright-core";
import { waitForDocumentPdfAssets, withDocumentPdfContext, withDocumentPdfPage } from "@/lib/documentPdfBrowser";
import {
  buildContractHtml,
  normalizeContractQuoteData,
  type ContractBrand,
  type ContractQuoteData,
} from "@/lib/contract/contractDocument";
import { fitA4Sheet } from "@/lib/contract/fitA4Sheet";

export type ContractPdfResult = {
  buffer: Buffer;
  quote: ContractQuoteData;
  brand: ContractBrand;
};

export async function renderContractPdfBuffer(
  contract: Record<string, unknown>,
  options: { baseUrl: string },
): Promise<ContractPdfResult> {
  const quote = normalizeContractQuoteData(contract.quote_data, contract);
  if (!quote) throw new Error("계약서에 PDF로 만들 계약 데이터가 없습니다.");

  const brand: ContractBrand = quote.quoteNumber.startsWith("JKQ-") || quote.quoteNumber.startsWith("JI-") ? "jakeimage" : "photoclinic";
  const html = buildContractHtml(
    quote,
    String(contract.signature_data_url ?? ""),
    brand,
    { baseUrl: options.baseUrl },
  );

  return { buffer: await renderA4HtmlPdf(html), quote, brand };
}

export async function renderA4HtmlPdf(
  html: string,
  options?: { fitSelector?: string; context?: BrowserContext },
): Promise<Buffer> {
  const render = (context: BrowserContext) => withDocumentPdfPage(context, { width: 794, height: 1123 }, async (page) => {
    await page.setContent(html, { waitUntil: "load" });
    await waitForDocumentPdfAssets(page);
    await page.emulateMedia({ media: "print" });

    if (options?.fitSelector) await page.locator(options.fitSelector).evaluate(fitA4Sheet);

    return Buffer.from(await page.pdf({
      format: "A4",
      printBackground: true,
      preferCSSPageSize: true,
      margin: { top: "0mm", right: "0mm", bottom: "0mm", left: "0mm" },
    }));
  });
  return options?.context ? render(options.context) : withDocumentPdfContext(render);
}
