import type { NextRequest } from "next/server";
import { isAdminSession } from "@/lib/passkey";
import { getSupabaseAdmin } from "@/lib/supabase";
import { documentMailErrorResponse, DocumentMailError, NO_DOCUMENT_CACHE, readDocumentMailProgress } from "@/lib/document-mail/repository";
import { documentMailReference, previewDocumentMail, sendDocumentMail } from "@/lib/document-mail/send";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET(request: NextRequest) {
  if (!isAdminSession(request)) return documentMailErrorResponse(new DocumentMailError("관리자 로그인이 필요합니다.", 401));
  try {
    const requestId = request.nextUrl.searchParams.get("requestId");
    if (requestId !== null) {
      const progress = await readDocumentMailProgress(getSupabaseAdmin(), requestId);
      return Response.json({ ok: true, progress }, { headers: NO_DOCUMENT_CACHE });
    }
    const anchor = documentMailReference(request.nextUrl.searchParams.get("kind"), request.nextUrl.searchParams.get("id"));
    const preview = await previewDocumentMail(getSupabaseAdmin(), anchor);
    return Response.json({ ok: true, preview }, { headers: NO_DOCUMENT_CACHE });
  } catch (error) {
    return documentMailErrorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  if (!isAdminSession(request)) return documentMailErrorResponse(new DocumentMailError("관리자 로그인이 필요합니다.", 401));
  try {
    const input = await request.json().catch(() => null);
    const anchor = documentMailReference(input?.anchor?.kind, input?.anchor?.id);
    const result = await sendDocumentMail(getSupabaseAdmin(), anchor, input, request.nextUrl.origin);
    return Response.json({ ok: true, ...result }, { headers: NO_DOCUMENT_CACHE });
  } catch (error) {
    return documentMailErrorResponse(error);
  }
}
