import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { isAdminSession } from "@/lib/passkey";
import {
  getConfiguredWorkerId,
  isKnownWorkerId,
  listConfiguredWorkerIds,
} from "@/lib/remoteWorkerAuth";
import { isRemoteWorkerOnline } from "@/lib/remote-jobs/workerPresence";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type WorkerRow = {
  worker_id: string;
  last_seen_at: string | null;
  worker_status: string | null;
  nas_connected: boolean | null;
  updated_at: string | null;
};

type WorkerStatus = {
  id: string;
  online: boolean | null;
  last_seen_at: string | null;
  worker_status: string | null;
  nas_connected: boolean | null;
};

function isAuthorized(request: NextRequest): boolean {
  const expected = process.env.INTERNAL_API_KEY;
  return isAdminSession(request) || Boolean(expected && request.headers.get("x-internal-key") === expected);
}

function unknownWorker(workerId: string): WorkerStatus {
  return {
    id: workerId,
    online: null,
    last_seen_at: null,
    worker_status: null,
    nas_connected: null,
  };
}

function toWorkerStatus(workerId: string, row?: WorkerRow): WorkerStatus {
  return {
    id: workerId,
    online: row ? isRemoteWorkerOnline(row.last_seen_at) : false,
    last_seen_at: row?.last_seen_at ?? null,
    worker_status: row?.worker_status ?? null,
    nas_connected: row?.nas_connected ?? null,
  };
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return Response.json({ ok: false, error: "관리자 로그인이 필요합니다." }, { status: 401 });
  }

  const all = request.nextUrl.searchParams.get("all") === "1";
  const requestedWorker = request.nextUrl.searchParams.get("worker")?.trim() || "";
  if (requestedWorker && !isKnownWorkerId(requestedWorker)) {
    return Response.json({ ok: false, error: "등록되지 않은 Worker입니다." }, { status: 400 });
  }
  const workerIds = all ? listConfiguredWorkerIds() : [requestedWorker || getConfiguredWorkerId()];

  try {
    const { data, error } = await getSupabaseAdmin()
      .from("remote_workers")
      .select("worker_id,last_seen_at,worker_status,nas_connected,updated_at")
      .in("worker_id", workerIds);

    if (error) {
      console.warn("[remote-workers status]", error.message);
      const workers = workerIds.map(unknownWorker);
      return Response.json(all ? { ok: true, workers } : { ok: true, worker: workers[0] });
    }

    const rows = new Map((data ?? []).map((row) => [row.worker_id, row as WorkerRow]));
    const workers = workerIds.map((workerId) => toWorkerStatus(workerId, rows.get(workerId)));
    return Response.json(all ? { ok: true, workers } : { ok: true, worker: workers[0] });
  } catch (error) {
    console.error("[remote-workers status]", error);
    const workers = workerIds.map(unknownWorker);
    return Response.json(all ? { ok: true, workers } : { ok: true, worker: workers[0] });
  }
}
