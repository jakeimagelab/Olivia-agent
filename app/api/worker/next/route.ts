import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import {
  getConfiguredWorkerId,
  isAuthorizedWorker,
} from "@/lib/remoteWorkerAuth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  if (!isAuthorizedWorker(request)) {
    return Response.json(
      { ok: false, error: "Unauthorized worker" },
      { status: 401 }
    );
  }

  try {
    const supabase = getSupabaseAdmin();
    const workerId = getConfiguredWorkerId();
    const now = new Date().toISOString();
    const nasHeader = request.headers.get("x-olivia-nas-connected")?.trim().toLowerCase();
    const nasConnected = nasHeader === "true" ? true : nasHeader === "false" ? false : undefined;

    // 승인된 촬영 프로젝트를 원격 실행 큐로 넘기는 claim은 DB 함수가 원자적으로 수행한다.
    // migration이 아직 적용되지 않은 환경에서도 기존 job polling은 계속 동작해야 한다.
    const { error: stageClaimError } = await supabase.rpc("claim_approved_photo_project", {
      p_worker_id: workerId,
    });
    if (stageClaimError) console.warn("[worker/next photo-stage claim]", stageClaimError.message);

    // JPG staging이 끝난 프로젝트는 별도 승인 없이 기존 Scene Runner로 넘긴다.
    const { error: classifyClaimError } = await supabase.rpc("claim_copy_completed_photo_project", {
      p_worker_id: workerId,
    });
    if (classifyClaimError) console.warn("[worker/next photo-classify claim]", classifyClaimError.message);

    const { error: heartbeatError } = await supabase
      .from("remote_workers")
      .upsert({
        worker_id: workerId,
        last_seen_at: now,
        worker_status: "online",
        updated_at: now,
        ...(nasConnected === undefined ? {} : { nas_connected: nasConnected }),
      }, { onConflict: "worker_id" });

    // Migration 적용 전에도 기존 Worker job claim은 계속 동작해야 한다.
    if (heartbeatError) console.warn("[worker/next heartbeat]", heartbeatError.message);

    const { data, error } = await supabase.rpc("claim_remote_job", {
      p_worker_id: workerId,
    });

    if (error) throw error;

    const job = Array.isArray(data) ? data[0] : null;

    if (!heartbeatError) {
      const { error: statusError } = await supabase
        .from("remote_workers")
        .update({
          worker_status: job ? "busy" : "idle",
          last_seen_at: now,
          updated_at: now,
        })
        .eq("worker_id", workerId);
      if (statusError) console.warn("[worker/next status]", statusError.message);
    }

    if (!job) {
      return Response.json({});
    }

    return Response.json({
      job_id: job.job_id,
      action: job.action,
      payload: job.payload ?? {},
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Remote job claim failed";

    console.error("[worker/next]", error);

    return Response.json(
      { ok: false, error: message },
      { status: 500 }
    );
  }
}
