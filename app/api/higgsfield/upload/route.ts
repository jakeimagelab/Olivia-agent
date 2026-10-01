import { NextRequest, NextResponse } from "next/server";
import { isAdminSession } from "@/lib/passkey";
import { createVideoUploadTicket } from "@/lib/higgsfield/adapter";
import { publicHiggsfieldError } from "@/lib/higgsfield/normalize";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  if (!isAdminSession(request)) return NextResponse.json({ ok: false, error: "관리자 로그인이 필요합니다." }, { status: 401 });
  const body = await request.json().catch(() => null) as { contentType?: unknown } | null;
  try {
    const ticket = await createVideoUploadTicket(body?.contentType);
    return NextResponse.json({ ok: true, ticket }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const normalized = publicHiggsfieldError(error);
    const status = normalized.code === "not_configured" ? 503 : normalized.code === "validation" ? 400 : 502;
    return NextResponse.json({ ok: false, error: normalized.message, detail: normalized.detail, code: normalized.code }, { status });
  }
}
