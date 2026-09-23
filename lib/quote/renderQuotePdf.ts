import { resolveServerBaseUrl } from "@/lib/baseUrl";
import { createQuotePrintToken, QUOTE_PRINT_AUTH_HEADER } from "@/lib/quote/quotePrintAuth";

// app/api/quotes/[id]/render/route.ts(미리보기 PNG/PDF)와 publish_quote(최종 PDF 아카이브,
// lib/olivia/v2/toolExecutors/quote.ts)가 둘 다 쓰는 공용 렌더러. quote row → Buffer 변환
// 로직은 한 곳에만 있어야 두 경로가 서로 다른 결과물을 만들어내는 일이 없다.

// @sparticuz/chromium은 Vercel/Lambda용 리눅스 바이너리라 로컬 Mac에서 직접 실행되지 않는다 —
// 로컬 개발에서는 `npx playwright install chromium`으로 받은 로컬 브라우저를 그대로 쓰고,
// 실제 Vercel(프로덕션)에서만 @sparticuz/chromium의 executablePath를 쓴다.
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

export type QuoteRenderFormat = "pdf" | "png";

export type QuoteRenderResult = {
  buffer: Buffer;
  contentType: string;
  ext: string;
};

export async function renderQuoteBuffer(
  quote: Record<string, unknown>,
  format: QuoteRenderFormat,
  opts: { baseUrl?: string } = {},
): Promise<QuoteRenderResult> {
  const baseUrl = opts.baseUrl || resolveServerBaseUrl();
  const quoteId = typeof quote.id === "string" ? quote.id.trim() : "";
  if (!quoteId) throw new Error("견적서 PDF 렌더링에 quote id가 필요합니다.");
  const printUrl = `${baseUrl.replace(/\/$/, "")}/quote-print/${encodeURIComponent(quoteId)}?print=1`;

  let browser;
  try {
    browser = await launchBrowser();
    const page = await browser.newPage({ viewport: { width: 1123, height: 794 } });
    await page.setExtraHTTPHeaders({
      [QUOTE_PRINT_AUTH_HEADER]: createQuotePrintToken(quoteId),
    });
    const response = await page.goto(printUrl, { waitUntil: "networkidle" });
    if (!response?.ok()) {
      throw new Error(`견적서 print page를 열지 못했습니다. (${response?.status() ?? "응답 없음"})`);
    }
    await page.waitForSelector('[data-quote-print-ready="true"]', { state: "attached" });
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

    if (format === "pdf") {
      await page.emulateMedia({ media: "print" });
      const buffer = await page.pdf({
        format: "A4",
        landscape: true,
        printBackground: true,
        margin: { top: "0mm", right: "0mm", bottom: "0mm", left: "0mm" },
        preferCSSPageSize: true,
      });
      return { buffer: Buffer.from(buffer), contentType: "application/pdf", ext: "pdf" };
    }
    const el = await page.$(".quote-page");
    const shot = el ? await el.screenshot({ type: "png" }) : await page.screenshot({ type: "png", fullPage: true });
    return { buffer: Buffer.from(shot), contentType: "image/png", ext: "png" };
  } finally {
    await browser?.close().catch((error) => { console.error("[OLIVIA] Suppressed promise rejection", error); });
  }
}
