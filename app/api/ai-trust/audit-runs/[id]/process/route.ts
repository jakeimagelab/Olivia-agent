import { NextRequest, NextResponse } from "next/server";
import { refreshAiTrustRunProgress } from "@/lib/ai-trust/jobs";
import { runAiTrustWorkerBatch } from "@/lib/ai-trust/worker";
import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

type Params = { params: Promise<{ id: string }> };

/**
 * Legacy manual-process endpoint kept for old links. It no longer calls an AI
 * provider directly; all work passes through the same durable queue, retry,
 * budget and cost-ledger path as the cron worker.
 */
export async function POST(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const batchSize = Math.min(5, Math.max(1, Number(body.batch_size || 2)));
  const db = getSupabaseAdmin();
  const { data: run, error } = await db.from("ai_trust_audit_runs").select("id,status").eq("id", id).maybeSingle();
  if (error || !run) return NextResponse.json({ ok: false, error: error?.message || "측정 작업을 찾지 못했습니다." }, { status: 404 });
  if (run.status === "PAUSED") return NextResponse.json({ ok: true, run, processed: 0 });

  const results = await runAiTrustWorkerBatch(db, { batchSize, workerId: `manual-${crypto.randomUUID()}` });
  await refreshAiTrustRunProgress(db, id);
  const { data: freshRun } = await db.from("ai_trust_audit_runs").select("*").eq("id", id).single();
  return NextResponse.json({ ok: true, run: freshRun, processed: results.length, results });
}
