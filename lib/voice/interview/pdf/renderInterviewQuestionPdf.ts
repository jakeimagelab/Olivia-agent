import { resolveServerBaseUrl } from "@/lib/baseUrl";
import { buildInterviewQuestionPdfHtml, type InterviewQuestionPdfInput } from "@/lib/voice/interview/pdf/buildInterviewQuestionPdfHtml";

async function launchBrowser() {
  const { chromium: playwrightChromium } = await import("playwright-core");
  const isServerless = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
  if (isServerless) {
    const chromium = (await import("@sparticuz/chromium")).default;
    return playwrightChromium.launch({ args: chromium.args, executablePath: await chromium.executablePath(), headless: true });
  }
  return playwrightChromium.launch({ headless: true });
}

/** Native Chromium renderer. It receives the same generated HTML used by preview. */
export async function renderInterviewQuestionPdf(input: InterviewQuestionPdfInput): Promise<Buffer> {
  const baseUrl = resolveServerBaseUrl().replace(/\/$/, "");
  const html = buildInterviewQuestionPdfHtml({ ...input, logoSrc: `${baseUrl}/assets/photoclinic-logo.png` });
  let browser: Awaited<ReturnType<typeof launchBrowser>> | undefined;
  try {
    browser = await launchBrowser();
    const page = await browser.newPage({ viewport: { width: 794, height: 1123 } });
    await page.setContent(html, { waitUntil: "networkidle" });
    await page.evaluate(async () => {
      await document.fonts.ready;
      await Promise.all(Array.from(document.images).map((image) => image.complete ? Promise.resolve() : new Promise<void>((resolve) => {
        image.addEventListener("load", () => resolve(), { once: true });
        image.addEventListener("error", () => resolve(), { once: true });
      })));
    });
    await page.emulateMedia({ media: "print" });
    return Buffer.from(await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "0mm", right: "0mm", bottom: "0mm", left: "0mm" },
      preferCSSPageSize: true,
    }));
  } finally {
    await browser?.close().catch((error) => console.error("[voice/interview/pdf] browser close", error));
  }
}
