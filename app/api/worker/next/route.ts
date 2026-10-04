import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import {
  authorizeWorker,
  getConfiguredWorkerId,
} from "@/lib/remoteWorkerAuth";
import { readWorkerDiagnostics, workerDiagnosticsToRow } from "@/lib/system-status/workerDiagnostics";
import { applyPhotoWorkerJobPolicy } from "@/lib/photo-classifier/workerJobPolicy";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const workerId = authorizeWorker(request);
  if (!workerId) {
    return Response.json(
      { ok: false, error: "Unauthorized worker" },
      { status: 401 }
    );
  }

  try {
    const supabase = getSupabaseAdmin();
    const now = new Date().toISOString();
    const nasHeader = request.headers.get("x-olivia-nas-connected")?.trim().toLowerCase();
    const nasConnected = nasHeader === "true" ? true : nasHeader === "false" ? false : undefined;
    const workerDiagnostics = workerDiagnosticsToRow(readWorkerDiagnostics(request.headers));

    // 승인된 촬영 프로젝트를 원격 실행 큐로 넘기는 claim은 DB 함수가 원자적으로 수행한다.
    // migration이 아직 적용되지 않은 환경에서도 기존 job polling은 계속 동작해야 한다.
    // 순서: 1차 승인(JPG 통합) → 2차 승인(SSD1→SSD2 복사) → 분류.
    if (workerId === getConfiguredWorkerId()) {
      const { error: mergeClaimError } = await supabase.rpc("claim_merge_approved_photo_project", {
        p_worker_id: workerId,
      });
      if (mergeClaimError) console.warn("[worker/next photo-merge claim]", mergeClaimError.message);

      const { error: stageClaimError } = await supabase.rpc("claim_approved_photo_project", {
        p_worker_id: workerId,
      });
      if (stageClaimError) console.warn("[worker/next photo-stage claim]", stageClaimError.message);

      // PHASE 3에서는 SSD1 JPG전체 → SSD2 JPG전체 COPY까지만 수행한다.
      // Scene 분류 자동 연결은 다음 PHASE에서 명시적으로 opt-in한다.
      if (process.env.OLIVIA_ENABLE_PHOTO_CLASSIFICATION_AUTOMATION === "1") {
        const { error: classifyClaimError } = await supabase.rpc("claim_copy_completed_photo_project", {
          p_worker_id: workerId,
        });
        if (classifyClaimError) console.warn("[worker/next photo-classify claim]", classifyClaimError.message);
      }

      // NAS 채팅 경로는 폴더·등록 고객에서 진료과를 확인하고, 사진별 AI 판정으로 결과를
      // 나눈다. 촬영모드는 더 이상 폴더 단위 입력값이 아니므로 위 플래그와 무관하게 claim한다.
      const { error: nasClassifyClaimError } = await supabase.rpc("claim_nas_classify_photo_project", {
        p_worker_id: workerId,
      });
      if (nasClassifyClaimError) console.warn("[worker/next nas-classify claim]", nasClassifyClaimError.message);
    }

    let { error: heartbeatError } = await supabase
      .from("remote_workers")
      .upsert({
        worker_id: workerId,
        last_seen_at: now,
        worker_status: "online",
        updated_at: now,
        ...(nasConnected === undefined ? {} : { nas_connected: nasConnected }),
        ...workerDiagnostics,
      }, { onConflict: "worker_id" });

    // 새 진단 migration보다 Worker 배포가 먼저 된 경우에도 기존 heartbeat/job claim은
    // 멈추지 않는다. 진단 컬럼을 뺀 기존 payload로 한 번만 재시도한다.
    if (heartbeatError && Object.keys(workerDiagnostics).length > 0) {
      const fallback = await supabase
        .from("remote_workers")
        .upsert({
          worker_id: workerId,
          last_seen_at: now,
          worker_status: "online",
          updated_at: now,
          ...(nasConnected === undefined ? {} : { nas_connected: nasConnected }),
        }, { onConflict: "worker_id" });
      if (!fallback.error) heartbeatError = null;
    }

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
      payload: applyPhotoWorkerJobPolicy(job),
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
