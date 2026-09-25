import { NextRequest, NextResponse } from "next/server";
import { publishContract } from "@/lib/core/commands/document";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const result = await publishContract(id, {
    clientId: typeof body.clientId === "string" ? body.clientId : undefined,
    workflowRunId: typeof body.workflowRunId === "string" ? body.workflowRunId : undefined,
    finalize: body.finalize === true,
  });
  if (!result.ok) {
    const status = result.code === "NOT_FOUND" ? 404 : result.code === "BLOCKED" ? 400 : 500;
    return NextResponse.json({ ok: false, error: result.reason, code: result.code, ...result.details }, { status });
  }
  return NextResponse.json(result.value);
}
