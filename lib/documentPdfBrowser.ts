import type { BrowserContext, Page } from "playwright-core";

export async function withDocumentPdfContext<T>(render: (context: BrowserContext) => Promise<T>) {
  const { chromium: playwrightChromium } = await import("playwright-core");
  const serverless = process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME;
  const chromium = serverless ? (await import("@sparticuz/chromium")).default : null;
  const browser = await playwrightChromium.launch({
    headless: true,
    ...(chromium && { args: chromium.args, executablePath: await chromium.executablePath() }),
  });
  try {
    return await render(await browser.newContext());
  } finally {
    await browser.close().catch((error: unknown) => console.error("[document-pdf] Chromium close failed", error instanceof Error ? error.name : "unknown"));
  }
}

export async function withDocumentPdfPage<T>(
  context: BrowserContext,
  viewport: { width: number; height: number },
  render: (page: Page) => Promise<T>,
) {
  const page = await context.newPage();
  try {
    await page.setViewportSize(viewport);
    return await render(page);
  } finally {
    await page.close().catch((error: unknown) => console.error("[document-pdf] page close failed", error instanceof Error ? error.name : "unknown"));
  }
}

export async function waitForDocumentPdfAssets(page: Page) {
  await page.waitForFunction(() => document.fonts.status === "loaded"
    && Array.from(document.images).every((image) => image.complete), undefined, { timeout: 12_000 });
}
