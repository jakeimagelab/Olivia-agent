import { buildQuoteHtml } from "./buildQuoteHtml";
import { resolveServerBaseUrl } from "@/lib/baseUrl";

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
  const html = buildQuoteHtml(quote, { baseUrl });

  let browser;
  try {
    browser = await launchBrowser();
    const page = await browser.newPage({ viewport: { width: 794, height: 1123 } });
    await page.setContent(html, { waitUntil: "networkidle" });

    if (format === "pdf") {
      const buffer = await page.pdf({ width: "794px", height: "1123px", printBackground: true });
      return { buffer: Buffer.from(buffer), contentType: "application/pdf", ext: "pdf" };
    }
    const el = await page.$(".quote-page");
    const shot = el ? await el.screenshot({ type: "png" }) : await page.screenshot({ type: "png", fullPage: true });
    return { buffer: Buffer.from(shot), contentType: "image/png", ext: "png" };
  } finally {
    await browser?.close().catch(() => {});
  }
}
