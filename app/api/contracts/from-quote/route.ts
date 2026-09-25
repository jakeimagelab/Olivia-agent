import { NextRequest, NextResponse } from "next/server";
import { createContractFromQuote } from "@/lib/core/commands/document";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null) as { quoteId?: string } | null;
  const quoteId = typeof body?.quoteId === "string" ? body.quoteId : "";
  if (!quoteId) return NextResponse.json({ ok: false, error: "quoteId가 필요합니다." }, { status: 400 });

  const result = await createContractFromQuote(quoteId);
  if (!result.ok) {
    const status = result.code === "NOT_FOUND" ? 404
      : result.code === "CONTRACT_SOURCE_CONFLICT" ? 409
      : ["UNAPPROVED_QUOTE", "BLOCKED", "INVALID_QUOTE"].includes(result.code ?? "") ? 400
      : 500;
    return NextResponse.json({ ok: false, error: result.reason, code: result.code, ...result.details }, { status });
  }
  return NextResponse.json({ ok: true, ...result.value, idempotent: result.idempotent ?? false });
}
