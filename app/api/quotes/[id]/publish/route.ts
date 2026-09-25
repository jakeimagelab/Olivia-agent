import { NextRequest, NextResponse } from "next/server";
import { publishQuote } from "@/lib/core/commands/document";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const result = await publishQuote(id, {
    forceClientId: typeof body.forceClientId === "string" ? body.forceClientId : undefined,
    forceCreateNew: body.forceCreateNew === true,
  });
  if (!result.ok) {
    const status = result.code === "NOT_FOUND" ? 404 : result.code === "AMBIGUOUS" ? 409 : 500;
    const candidate = result.details?.candidate;
    return NextResponse.json({
      ok: false,
      error: result.reason,
      code: result.code,
      ...result.details,
      ...(candidate ? { needsConfirmation: true, candidate } : {}),
    }, { status });
  }
  return NextResponse.json(result.value);
}
