import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { renderQuoteBuffer } from "@/lib/quote/renderQuotePdf";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const BUCKET = "olivia-chat-attachments";

export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const body = await req.json().catch(() => ({})) as { format?: string };
  const format = body.format === "pdf" ? "pdf" : "png";

  const db = getSupabaseAdmin();
  const { data: quote, error } = await db.from("quotes").select("*").eq("id", id).maybeSingle();
  if (error || !quote) {
    return NextResponse.json({ ok: false, error: "견적서를 찾지 못했어요." }, { status: 404 });
  }

  // Chromium이 반드시 이 요청을 처리 중인 동일 배포/동일 dev port의 print route를 열어야
  // 한다. 전역 fallback URL을 쓰면 로컬 커스텀 port나 Vercel preview에서 다른 배포를
  // 렌더할 수 있으므로 실제 request origin을 canonical base URL로 사용한다.
  const baseUrl = new URL(req.url).origin;

  try {
    const { buffer, contentType, ext } = await renderQuoteBuffer(quote as Record<string, unknown>, format, { baseUrl });

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
  }
}
