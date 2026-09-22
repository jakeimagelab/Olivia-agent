import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import {
  getConfiguredWorkerId,
  isAuthorizedWorker,
} from "@/lib/remoteWorkerAuth";
import { parseRemoteJobProgress } from "@/lib/remote-jobs/progress";
import { syncPhotoMergeProject } from "@/lib/photo-storage/mergeSync";
import { syncPhotoStageProject } from "@/lib/photo-storage/copySync";
import { syncPhotoClassificationProject } from "@/lib/photo-storage/classificationSync";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RemoteJobRecord = {
  id: string;
  status: string;
  action: string;
  payload: Record<string, unknown> | null;
};

const PHOTO_LIFECYCLE_ACTIONS = new Set([
  "PHOTO_PREPARE_SOURCE",
  "PHOTO_STAGE_JPG",
  "PHOTO_CLASSIFY_WORK",
]);

async function syncPhotoLifecycle(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  data: RemoteJobRecord,
  input: {
    status: "RUNNING" | "COMPLETED" | "FAILED";
    progress: ReturnType<typeof parseRemoteJobProgress>;
    result?: unknown;
    error?: string | null;
    message?: string | null;
  },
): Promise<void> {
  const payload = data.payload && typeof data.payload === "object" && !Array.isArray(data.payload)
    ? data.payload
    : {};
  const common = {
    jobId: data.id,
    jobStatus: input.status,
    payload,
    progress: input.progress,
    result: input.result,
    error: input.error,
    message: input.message,
  };

  if (data.action === "PHOTO_PREPARE_SOURCE") {
    await syncPhotoMergeProject(supabase, common);
  } else if (data.action === "PHOTO_STAGE_JPG") {
    await syncPhotoStageProject(supabase, common);
  } else if (data.action === "PHOTO_CLASSIFY_WORK") {
    await syncPhotoClassificationProject(supabase, common);
  }
}

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

  if (!["RUNNING", "COMPLETED", "FAILED"].includes(status)) {
    return Response.json(
      { ok: false, error: "Invalid status" },
      { status: 400 }
    );
  }

  let progress = null;
  try {
    progress = parseRemoteJobProgress(body.progress);
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "Invalid progress" },
      { status: 400 }
    );
  }

  if (status === "RUNNING" && !progress && typeof body.message !== "string") {
    return Response.json(
      { ok: false, error: "RUNNING report에는 progress 또는 message가 필요합니다." },
      { status: 400 }
    );
  }

  try {
    const supabase = getSupabaseAdmin();

    const now = new Date().toISOString();
    const updateData: Record<string, unknown> = {
      status,
      updated_at: now,
      ...(status === "RUNNING" ? {} : { completed_at: now }),
    };

    if (typeof body.message === "string") {
      updateData.message = body.message;
    }

    if (body.result !== undefined) {
      updateData.result = body.result;
    }

    if (progress) updateData.progress = progress;

    if (status === "FAILED" && typeof body.error === "string") {
      updateData.error = body.error;
    }

    // Terminal photo reports must synchronize the project while the remote job
    // is still RUNNING. The recovery claim RPC excludes active jobs, so this
    // ordering closes the window where a stale CLASSIFY_QUEUED project could be
    // claimed again between the job completion and project completion writes.
    let lifecycleSyncedBeforeTerminalUpdate = false;
    if (status !== "RUNNING") {
      const { data: runningJob, error: runningJobError } = await supabase
        .from("remote_jobs")
        .select("id,status,action,payload")
        .eq("id", jobId)
        .eq("target_worker", getConfiguredWorkerId())
        .eq("status", "RUNNING")
        .maybeSingle();
      if (runningJobError) throw runningJobError;
      if (!runningJob) {
        return Response.json(
          { ok: false, error: "Running job not found" },
          { status: 404 }
        );
      }
      if (PHOTO_LIFECYCLE_ACTIONS.has(runningJob.action)) {
        await syncPhotoLifecycle(supabase, runningJob as RemoteJobRecord, {
          status: status as "COMPLETED" | "FAILED",
          progress,
          result: body.result,
          error: typeof body.error === "string" ? body.error : null,
          message: typeof body.message === "string" ? body.message : null,
        });
        lifecycleSyncedBeforeTerminalUpdate = true;
      }
    }

    const { data, error } = await supabase
      .from("remote_jobs")
      .update(updateData)
      .eq("id", jobId)
      .eq("target_worker", getConfiguredWorkerId())
      .eq("status", "RUNNING")
        .select("id,status,action,payload")
      .maybeSingle();

    if (error) throw error;

    if (!data) {
      return Response.json(
        { ok: false, error: "Running job not found" },
        { status: 404 }
      );
    }

    if (PHOTO_LIFECYCLE_ACTIONS.has(data.action) && !lifecycleSyncedBeforeTerminalUpdate) {
      try {
        await syncPhotoLifecycle(supabase, data as RemoteJobRecord, {
          status: status as "RUNNING" | "COMPLETED" | "FAILED",
          progress,
          result: body.result,
          error: typeof body.error === "string" ? body.error : null,
          message: typeof body.message === "string" ? body.message : null,
        });
      } catch (projectError) {
        // RUNNING progress remains observational: a transient project sync
        // failure must not prevent the worker from continuing its active job.
        console.warn("[worker/report photo project sync]", projectError instanceof Error ? projectError.message : projectError);
      }
    }

    const nasConnected = data.action === "LIST_FOLDER" && status === "COMPLETED"
      ? true
      : typeof body.nas_connected === "boolean"
        ? body.nas_connected
        : undefined;
    const { error: heartbeatError } = await supabase
      .from("remote_workers")
      .upsert({
        worker_id: getConfiguredWorkerId(),
        last_seen_at: now,
        worker_status: status === "RUNNING" ? "busy" : "idle",
        updated_at: now,
        ...(nasConnected === undefined ? {} : { nas_connected: nasConnected }),
      }, { onConflict: "worker_id" });
    if (heartbeatError) console.warn("[worker/report heartbeat]", heartbeatError.message);

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
