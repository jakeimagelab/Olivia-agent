import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { buildQuoteHtml } from "@/lib/quote/buildQuoteHtml";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const BUCKET = "olivia-chat-attachments";

// @sparticuz/chromium은 Vercel/Lambda용 리눅스 바이너리라 이 Mac에서 직접 실행되지 않는다 —
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

export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const body = await req.json().catch(() => ({})) as { format?: string };
  const format = body.format === "pdf" ? "pdf" : "png";

  const db = getSupabaseAdmin();
  const { data: quote, error } = await db.from("quotes").select("*").eq("id", id).maybeSingle();
  if (error || !quote) {
    return NextResponse.json({ ok: false, error: "견적서를 찾지 못했어요." }, { status: 404 });
  }

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL
    || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined)
    || "http://127.0.0.1:3000";
  const html = buildQuoteHtml(quote as Record<string, unknown>, { baseUrl });

  let browser;
  try {
    browser = await launchBrowser();
    const page = await browser.newPage({ viewport: { width: 794, height: 1123 } });
    await page.setContent(html, { waitUntil: "networkidle" });

    let buffer: Buffer;
    let contentType: string;
    let ext: string;
    if (format === "pdf") {
      buffer = await page.pdf({ width: "794px", height: "1123px", printBackground: true });
      contentType = "application/pdf";
      ext = "pdf";
    } else {
      const el = await page.$(".quote-page");
      const shot = el ? await el.screenshot({ type: "png" }) : await page.screenshot({ type: "png", fullPage: true });
      buffer = Buffer.from(shot);
      contentType = "image/png";
      ext = "png";
    }

    const storagePath = `quote-render/${id}/${Date.now()}.${ext}`;
    const { error: uploadError } = await db.storage.from(BUCKET).upload(storagePath, buffer, {
      contentType,
      cacheControl: "300",
      upsert: true,
    });
    if (uploadError) throw new Error(uploadError.message);

    const { data: signed, error: signError } = await db.storage
      .from(BUCKET)
      .createSignedUrl(storagePath, 60 * 30);
    if (signError || !signed?.signedUrl) throw new Error(signError?.message || "미리보기 링크를 만들지 못했어요.");

    return NextResponse.json({ ok: true, url: signed.signedUrl, format, quoteId: id });
  } catch (err) {
    const message = err instanceof Error ? err.message : "견적서를 렌더링하지 못했어요.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  } finally {
    await browser?.close().catch(() => {});
  }
}
