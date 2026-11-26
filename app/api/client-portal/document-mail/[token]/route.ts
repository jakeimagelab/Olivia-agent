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

export async function GET(request: NextRequest, { params }: Context) {
  try {
    const kind = request.nextUrl.searchParams.get("kind");
    if (!isDocumentMailKind(kind)) throw new DocumentMailError("문서를 선택해 주세요.");
    const db = getSupabaseAdmin();
    const delivery = await loadReceivedDocuments(db, (await params).token);
    const document = delivery && visibleDeliveredDocuments(delivery).find((item) => item.kind === kind);
    if (!document) throw new DocumentMailError("문서를 찾을 수 없습니다. 메일 링크를 확인해 주세요.", 404);
    const download = request.nextUrl.searchParams.get("download") === "1";
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
