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

type WorkerStatusCacheEntry = {
  expiresAt: number;
  workers: WorkerStatus[];
};

const WORKER_STATUS_DB_TTL_MS = 15_000;
const WORKER_STATUS_STALE_TTL_MS = 5 * 60_000;
const workerStatusCache = new Map<string, WorkerStatusCacheEntry>();
const workerStatusRequests = new Map<string, Promise<WorkerStatus[]>>();

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

function cacheKey(workerIds: readonly string[]) {
  return [...workerIds].sort().join("\u0000");
}

async function loadWorkerStatuses(workerIds: string[]): Promise<WorkerStatus[]> {
  const key = cacheKey(workerIds);
  const now = Date.now();
  const cached = workerStatusCache.get(key);
  if (cached && cached.expiresAt > now) return cached.workers;

  const existing = workerStatusRequests.get(key);
  if (existing) return existing;

  const request = (async () => {
    const { data, error } = await getSupabaseAdmin()
      .from("remote_workers")
      .select("worker_id,last_seen_at,worker_status,nas_connected,updated_at")
      .in("worker_id", workerIds);
    if (error) throw error;

    const rows = new Map((data ?? []).map((row) => [row.worker_id, row as WorkerRow]));
    const workers = workerIds.map((workerId) => toWorkerStatus(workerId, rows.get(workerId)));
    workerStatusCache.set(key, { expiresAt: Date.now() + WORKER_STATUS_DB_TTL_MS, workers });
    return workers;
  })();
  workerStatusRequests.set(key, request);
  try {
    return await request;
  } finally {
    if (workerStatusRequests.get(key) === request) workerStatusRequests.delete(key);
  }
}

function staleWorkerStatuses(workerIds: string[]): WorkerStatus[] | null {
  const cached = workerStatusCache.get(cacheKey(workerIds));
  if (!cached || Date.now() - cached.expiresAt > WORKER_STATUS_STALE_TTL_MS) return null;
  return cached.workers;
}

function statusResponse(all: boolean, workers: WorkerStatus[], stale = false) {
  return Response.json(
    all ? { ok: true, workers, stale } : { ok: true, worker: workers[0], stale },
    { headers: { "Cache-Control": "private, max-age=5, stale-while-revalidate=15" } },
  );
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
    return statusResponse(all, await loadWorkerStatuses(workerIds));
  } catch (error) {
    console.warn("[remote-workers status]", error instanceof Error ? error.message : error);
    const cached = staleWorkerStatuses(workerIds);
    return statusResponse(all, cached ?? workerIds.map(unknownWorker), true);
  }
}
