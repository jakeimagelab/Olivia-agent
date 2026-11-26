import type { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import {
  documentMailErrorResponse, documentPdfLink, DocumentMailError, loadReceivedDocuments,
  NO_DOCUMENT_CACHE, receivedPdfFileName, visibleDeliveredDocuments,
} from "@/lib/document-mail/repository";
import { isDocumentMailKind } from "@/lib/document-mail/shared";
import { signReceivedContract } from "@/lib/document-mail/sign";

type Context = { params: Promise<{ token: string }> };
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const CONTRACT_PREVIEW_HEAD = `<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  @media screen {
    .contract-page { width: min(100%, 794px); }
    .clause { font-size: 14px; line-height: 1.6; }
  }
  @media screen and (max-width: 600px) {
    body { padding: 0; }
    .contract-page { padding: 20px 16px; }
    .header, .parties, .amount-panel, .sign-area { grid-template-columns: minmax(0, 1fr); }
    .header { gap: 12px; }
    .doc-title, .doc-meta { text-align: left; }
    .brand-sub, .doc-title { white-space: normal; }
    .quote-item { grid-template-columns: 22px minmax(0, 1fr) auto; gap: 8px; }
  }
</style>`;

function contractPreview(html: string) {
  const markup = html.replace(/<base\b[^>]*>/i, "").replace("</head>", `${CONTRACT_PREVIEW_HEAD}</head>`);
  return new Response(markup, { headers: {
    ...NO_DOCUMENT_CACHE,
    "Content-Type": "text/html; charset=utf-8",
    "Content-Security-Policy": "sandbox; default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
    "X-Content-Type-Options": "nosniff",
    "X-Robots-Tag": "noindex, nofollow",
  } });
}

export async function GET(request: NextRequest, { params }: Context) {
  try {
    const kind = request.nextUrl.searchParams.get("kind");
    if (!isDocumentMailKind(kind)) throw new DocumentMailError("문서를 선택해 주세요.");
    const db = getSupabaseAdmin();
    const delivery = await loadReceivedDocuments(db, (await params).token);
    const document = delivery && visibleDeliveredDocuments(delivery).find((item) => item.kind === kind);
    if (!delivery || !document) throw new DocumentMailError("문서를 찾을 수 없습니다. 메일 링크를 확인해 주세요.", 404);
    const download = request.nextUrl.searchParams.get("download") === "1";
    if (document.kind === "contract" && !document.signed) {
      if (download || request.nextUrl.searchParams.get("preview") !== "1") {
        throw new DocumentMailError("계약서에 전자서명한 뒤 PDF를 내려받을 수 있습니다.", 403);
      }
      if (!delivery.contract_html) throw new DocumentMailError("계약서 내용을 열 수 없습니다. 담당자에게 새 링크를 요청해 주세요.", 404);
      return contractPreview(delivery.contract_html);
    }
    const url = await documentPdfLink(db, document.path, download ? receivedPdfFileName(document) : undefined);
    return new Response(null, { status: 303, headers: { ...NO_DOCUMENT_CACHE, Location: url } });
  } catch (error) {
    return documentMailErrorResponse(error);
  }
}

export async function POST(request: NextRequest, { params }: Context) {
  try {
    if (Number(request.headers.get("content-length")) > 520_000) throw new DocumentMailError("서명 파일이 너무 큽니다.", 413);
    const input = await request.json().catch(() => null);
    if (!input || typeof input !== "object" || Array.isArray(input)) throw new DocumentMailError("서명 내용을 확인해 주세요.");
    const result = await signReceivedContract(getSupabaseAdmin(), (await params).token, input);
    return Response.json({ ok: true, ...result }, { headers: NO_DOCUMENT_CACHE });
  } catch (error) {
    return documentMailErrorResponse(error);
  }
}
