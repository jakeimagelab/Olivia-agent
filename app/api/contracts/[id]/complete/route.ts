import { NextRequest, NextResponse } from "next/server";
import { completeContract } from "@/lib/core/commands/document";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function errorStatus(code?: string) {
  if (code === "NOT_FOUND") return 404;
  if (["RESOURCE_PROJECT_MISMATCH", "RESOURCE_MISMATCH", "WORKFLOW_BLOCKED", "BLOCKED"].includes(code ?? "")) return 409;
  return 500;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await request.json().catch(() => ({})) as { workflowRunId?: unknown };
  const result = await completeContract(id, {
    workflowRunId: typeof body.workflowRunId === "string" ? body.workflowRunId : undefined,
  });
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.reason, code: result.code }, { status: errorStatus(result.code) });
  }
  return NextResponse.json({ ok: true, ...result.value, idempotent: result.idempotent ?? false });
}
