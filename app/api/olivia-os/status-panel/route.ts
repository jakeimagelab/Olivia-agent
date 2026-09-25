import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { isAdminSession } from "@/lib/passkey";
import { getConfiguredWorkerId } from "@/lib/remoteWorkerAuth";
import { isRemoteWorkerOnline } from "@/lib/remote-jobs/workerPresence";
import { findWorkflowConsistencyIssues } from "@/lib/workflowAutomation";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const RECENT_LIMIT = 5;

// 코드 요청서(2026-09-19) 상단바 상태표시 팝업. 세 테이블(remote_workers/worker_events/
// remote_jobs)을 한 번에 읽어서 응답한다 — 새 스키마 없음, 전부 읽기 전용. 한 조회가 실패해도
// (예: 마이그레이션 미적용) 그 섹션만 빈 값으로 내려주고 나머지는 정상 반환한다 — 기존
// /api/remote-workers/status와 같은 원칙.
export async function GET(request: NextRequest) {
  if (!isAdminSession(request)) {
    return Response.json({ ok: false, error: "관리자 로그인이 필요합니다." }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  const workerId = getConfiguredWorkerId();

  const [workerResult, backupsResult, jobsResult, consistencyResult] = await Promise.allSettled([
    supabase.from("remote_workers").select("worker_id,last_seen_at,worker_status,nas_connected").eq("worker_id", workerId).maybeSingle(),
    supabase.from("worker_events").select("id,folder_name,status,created_at").order("created_at", { ascending: false }).limit(RECENT_LIMIT),
    supabase.from("remote_jobs").select("id,action,status,created_at,completed_at").neq("action", "PING").order("created_at", { ascending: false }).limit(RECENT_LIMIT),
    findWorkflowConsistencyIssues(supabase),
  ]);

  if (workerResult.status === "rejected") console.warn("[status-panel] remote_workers 조회 실패", workerResult.reason);
  if (backupsResult.status === "rejected") console.warn("[status-panel] worker_events 조회 실패", backupsResult.reason);
  if (jobsResult.status === "rejected") console.warn("[status-panel] remote_jobs 조회 실패", jobsResult.reason);
  if (consistencyResult.status === "rejected") console.warn("[status-panel] workflow 정합성 조회 실패", consistencyResult.reason);

  const workerRow = workerResult.status === "fulfilled" && !workerResult.value.error ? workerResult.value.data : null;
  if (workerResult.status === "fulfilled" && workerResult.value.error) console.warn("[status-panel] remote_workers 조회 실패", workerResult.value.error.message);
  const backupsRows = backupsResult.status === "fulfilled" && !backupsResult.value.error ? backupsResult.value.data ?? [] : [];
  if (backupsResult.status === "fulfilled" && backupsResult.value.error) console.warn("[status-panel] worker_events 조회 실패", backupsResult.value.error.message);
  const jobsRows = jobsResult.status === "fulfilled" && !jobsResult.value.error ? jobsResult.value.data ?? [] : [];
  if (jobsResult.status === "fulfilled" && jobsResult.value.error) console.warn("[status-panel] remote_jobs 조회 실패", jobsResult.value.error.message);
  const coreBypassIssues = consistencyResult.status === "fulfilled"
    ? consistencyResult.value.filter((issue) => issue.kind === "core_bypass_suspected").slice(0, RECENT_LIMIT)
    : [];
  const consistencyError = consistencyResult.status === "rejected"
    ? consistencyResult.reason instanceof Error
      ? consistencyResult.reason.message
      : "워크플로우 정합성 점검에 실패했습니다."
    : null;

  return Response.json({
    ok: true,
    worker: {
      id: workerId,
      online: workerRow ? isRemoteWorkerOnline(workerRow.last_seen_at) : null,
      worker_status: workerRow?.worker_status ?? null,
      last_seen_at: workerRow?.last_seen_at ?? null,
      nas_connected: workerRow?.nas_connected ?? null,
    },
    recentBackups: backupsRows,
    recentJobs: jobsRows,
    coreBypassIssues,
    consistencyError,
  });
}
