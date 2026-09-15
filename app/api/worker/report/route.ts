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

    if (data.action === "PHOTO_STAGE_JPG") {
      try {
        await syncPhotoStageProject(supabase, {
          jobId: data.id,
          jobStatus: status as "RUNNING" | "COMPLETED" | "FAILED",
          payload: (data.payload && typeof data.payload === "object" && !Array.isArray(data.payload) ? data.payload : {}) as Record<string, unknown>,
          progress,
          result: body.result,
          error: typeof body.error === "string" ? body.error : null,
          message: typeof body.message === "string" ? body.message : null,
        });
      } catch (projectError) {
        // Job report 자체는 성공시켜 Worker가 재전송 루프에 빠지지 않게 하되,
        // 프로젝트 lifecycle 동기화 실패는 서버 로그에서 확인할 수 있게 남긴다.
        console.warn("[worker/report photo-stage project sync]", projectError instanceof Error ? projectError.message : projectError);
      }
    }

    if (data.action === "PHOTO_CLASSIFY_WORK") {
      try {
        await syncPhotoClassificationProject(supabase, {
          jobId: data.id,
          jobStatus: status as "RUNNING" | "COMPLETED" | "FAILED",
          payload: (data.payload && typeof data.payload === "object" && !Array.isArray(data.payload) ? data.payload : {}) as Record<string, unknown>,
          progress,
          result: body.result,
          error: typeof body.error === "string" ? body.error : null,
          message: typeof body.message === "string" ? body.message : null,
        });
      } catch (projectError) {
        console.warn("[worker/report photo-classify project sync]", projectError instanceof Error ? projectError.message : projectError);
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
