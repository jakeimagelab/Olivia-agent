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

    const { data, error } = await supabase.rpc("claim_remote_job", {
      p_worker_id: workerId,
    });

    if (error) throw error;

    const job = Array.isArray(data) ? data[0] : null;

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
