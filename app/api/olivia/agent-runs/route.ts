import { NextRequest, NextResponse } from "next/server";
import { ensurePrimaryAssistantOwner } from "@/lib/assistant/owners/service";
import { isAdminSession } from "@/lib/passkey";
import { getSupabaseAdmin } from "@/lib/supabase";
import { createAgentRun, listAgentRuns } from "@/lib/olivia/agentRuns/service";

export const dynamic = "force-dynamic";
export async function GET(req: NextRequest) {
  if (!isAdminSession(req)) return NextResponse.json({ ok: false, error: "관리자 로그인이 필요합니다." }, { status: 401 });
  try { return NextResponse.json({ ok: true, runs: await listAgentRuns(getSupabaseAdmin()) }); }
  catch (error) { return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Run 조회 실패" }, { status: 500 }); }
}
export async function POST(req: NextRequest) {
  if (!isAdminSession(req)) return NextResponse.json({ ok: false, error: "관리자 로그인이 필요합니다." }, { status: 401 });
  try {
    const body = await req.json();
    if (!String(body.goal || "").trim()) return NextResponse.json({ ok: false, error: "업무 목표가 필요합니다." }, { status: 400 });
    const db = getSupabaseAdmin();
    const owner = await ensurePrimaryAssistantOwner(db);
    const result = await createAgentRun(db, { ownerId: owner.id, conversationId: body.conversationId, clientId: body.clientId, workflowRunId: body.workflowRunId, goal: String(body.goal), source: body.source, runType: body.runType, context: body.context, metadata: body.metadata, idempotencyKey: String(body.idempotencyKey || crypto.randomUUID()) });
    return NextResponse.json({ ok: true, ...result }, { status: result.duplicate ? 200 : 201 });
  } catch (error) { return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Run 생성 실패" }, { status: 500 }); }
}
