import {
  buildContractHtml,
  normalizeContractQuoteData,
  type ContractBrand,
  type ContractQuoteData,
} from "@/lib/contract/contractDocument";

async function launchBrowser() {
  const { chromium: playwrightChromium } = await import("playwright-core");
  const isServerless = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);

  if (isServerless) {
    const chromium = (await import("@sparticuz/chromium")).default;
    const executablePath = await chromium.executablePath();
    return playwrightChromium.launch({ args: chromium.args, executablePath, headless: true });
  }

  return playwrightChromium.launch({ headless: true });
}

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

  const brand: ContractBrand = quote.quoteNumber.startsWith("JI-") ? "jakeimage" : "photoclinic";
  const html = buildContractHtml(
    quote,
    String(contract.signature_data_url ?? ""),
    brand,
    { baseUrl: options.baseUrl },
  );

  let browser;
  try {
    browser = await launchBrowser();
    const page = await browser.newPage({ viewport: { width: 794, height: 1123 } });
    await page.setContent(html, { waitUntil: "networkidle" });
    await page.evaluate(async () => {
      await document.fonts.ready;
      await Promise.all(Array.from(document.images).map((image) => {
        if (image.complete) return Promise.resolve();
        return new Promise<void>((resolve) => {
          image.addEventListener("load", () => resolve(), { once: true });
          image.addEventListener("error", () => resolve(), { once: true });
        });
      }));
    });
    await page.emulateMedia({ media: "print" });

    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      preferCSSPageSize: true,
      margin: { top: "0mm", right: "0mm", bottom: "0mm", left: "0mm" },
    });

    return { buffer: Buffer.from(pdf), quote, brand };
  } finally {
    await browser?.close().catch((error) => {
      console.error("[ContractPdf] Chromium close failed", error);
    });
  }
}
