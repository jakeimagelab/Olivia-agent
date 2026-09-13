import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import {
  getConfiguredWorkerId,
  isAuthorizedWorker,
} from "@/lib/remoteWorkerAuth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  if (!isAuthorizedWorker(request)) {
    return Response.json(
      { ok: false, error: "Unauthorized worker" },
      { status: 401 }
    );
  }

  const body = await request.json().catch(() => ({}));

  const jobId =
    typeof body.job_id === "string" ? body.job_id.trim() : "";

  const status =
    typeof body.status === "string"
      ? body.status.trim().toUpperCase()
      : "";

  if (!jobId) {
    return Response.json(
      { ok: false, error: "job_id is required" },
      { status: 400 }
    );
  }

  if (!["COMPLETED", "FAILED"].includes(status)) {
    return Response.json(
      { ok: false, error: "Invalid status" },
      { status: 400 }
    );
  }

  try {
    const supabase = getSupabaseAdmin();

    const updateData: Record<string, unknown> = {
      status,
      updated_at: new Date().toISOString(),
      completed_at: new Date().toISOString(),
    };

    if (typeof body.message === "string") {
      updateData.message = body.message;
    }

    if (body.result !== undefined) {
      updateData.result = body.result;
    }

    if (status === "FAILED" && typeof body.error === "string") {
      updateData.error = body.error;
    }

    const { data, error } = await supabase
      .from("remote_jobs")
      .update(updateData)
      .eq("id", jobId)
      .eq("target_worker", getConfiguredWorkerId())
      .eq("status", "RUNNING")
      .select("id,status")
      .maybeSingle();

    if (error) throw error;

    if (!data) {
      return Response.json(
        { ok: false, error: "Running job not found" },
        { status: 404 }
      );
    }

    return Response.json({
      ok: true,
      job_id: data.id,
      status: data.status,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Remote job report failed";

    console.error("[worker/report]", error);

    return Response.json(
      { ok: false, error: message },
      { status: 500 }
    );
  }
}
