import { NextRequest, NextResponse } from "next/server";
import { runAiTrustProvider } from "@/lib/ai-trust/providers";
import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

type Params = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const batchSize = Math.min(10, Math.max(1, Number(body.batch_size || 3)));
  const supabase = getSupabaseAdmin();

  const { data: run, error: runError } = await supabase.from("ai_trust_audit_runs").select("*").eq("id", id).single();
  if (runError || !run) return NextResponse.json({ ok: false, error: runError?.message || "Run not found" }, { status: 404 });
  if (run.status === "PAUSED" || run.status === "COMPLETED") return NextResponse.json({ ok: true, run, processed: 0 });

  await supabase
    .from("ai_trust_audit_runs")
    .update({ status: "RUNNING", started_at: run.started_at || new Date().toISOString() })
    .eq("id", id);
  await supabase.from("ai_trust_projects").update({ status: "RUNNING", updated_at: new Date().toISOString() }).eq("id", run.project_id);

  const { data: requests, error: requestError } = await supabase
    .from("ai_trust_audit_requests")
    .select("*, prompt:ai_trust_prompts(id, question, region, department)")
    .eq("run_id", id)
    .eq("status", "PENDING")
    .order("created_at", { ascending: true })
    .limit(batchSize);

  if (requestError) return NextResponse.json({ ok: false, error: requestError.message }, { status: 500 });
  if (!requests?.length) {
    await finishRunIfDone(id);
    const { data: freshRun } = await supabase.from("ai_trust_audit_runs").select("*").eq("id", id).single();
    return NextResponse.json({ ok: true, run: freshRun, processed: 0 });
  }

  let processed = 0;
  for (const item of requests) {
    const prompt = Array.isArray(item.prompt) ? item.prompt[0] : item.prompt;
    await supabase.from("ai_trust_audit_requests").update({ status: "RUNNING", started_at: new Date().toISOString() }).eq("id", item.id);
    try {
      const result = await runAiTrustProvider(item.provider, {
        question: prompt.question,
        region: prompt.region,
        department: prompt.department,
      });

      const { data: response, error: responseError } = await supabase
        .from("ai_trust_ai_responses")
        .insert({
          run_id: id,
          project_id: item.project_id,
          prompt_id: item.prompt_id,
          provider: item.provider,
          model: result.model,
          run_number: item.run_number,
          question: prompt.question,
          raw_response: result.raw_response,
          citations: result.citations,
          source_urls: result.source_urls,
          response_status: "COMPLETED",
        })
        .select("id")
        .single();

      if (responseError) throw responseError;

      await supabase
        .from("ai_trust_audit_requests")
        .update({ status: "COMPLETED", response_id: response.id, completed_at: new Date().toISOString() })
        .eq("id", item.id);
      processed += 1;
    } catch (err) {
      await supabase
        .from("ai_trust_audit_requests")
        .update({ status: "FAILED", error_message: String(err), completed_at: new Date().toISOString() })
        .eq("id", item.id);
    }
  }

  await refreshRunProgress(id);
  const { data: freshRun } = await supabase.from("ai_trust_audit_runs").select("*").eq("id", id).single();
  return NextResponse.json({ ok: true, run: freshRun, processed });
}

async function refreshRunProgress(runId: string) {
  const supabase = getSupabaseAdmin();
  const { data: rows } = await supabase.from("ai_trust_audit_requests").select("status").eq("run_id", runId);
  const completed = (rows || []).filter((row) => row.status === "COMPLETED").length;
  const failed = (rows || []).filter((row) => row.status === "FAILED").length;
  const pending = (rows || []).filter((row) => row.status === "PENDING" || row.status === "RUNNING").length;
  const patch: Record<string, unknown> = { completed_requests: completed, failed_requests: failed };
  if (pending === 0) {
    patch.status = failed > 0 ? "FAILED" : "COMPLETED";
    patch.completed_at = new Date().toISOString();
  }
  await supabase.from("ai_trust_audit_runs").update(patch).eq("id", runId);
}

async function finishRunIfDone(runId: string) {
  await refreshRunProgress(runId);
  const supabase = getSupabaseAdmin();
  const { data: run } = await supabase.from("ai_trust_audit_runs").select("project_id, status").eq("id", runId).single();
  if (run?.status === "COMPLETED" || run?.status === "FAILED") {
    await supabase.from("ai_trust_projects").update({ status: run.status, updated_at: new Date().toISOString() }).eq("id", run.project_id);
  }
}
