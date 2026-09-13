import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { isAdminSession } from "@/lib/passkey";
import { getConfiguredWorkerId } from "@/lib/remoteWorkerAuth";
import { isRemoteWorkerOnline } from "@/lib/remote-jobs/workerPresence";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function isAuthorized(request: NextRequest): boolean {
  const expected = process.env.INTERNAL_API_KEY;
  return isAdminSession(request) || Boolean(expected && request.headers.get("x-internal-key") === expected);
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return Response.json({ ok: false, error: "관리자 로그인이 필요합니다." }, { status: 401 });
  }

  const workerId = getConfiguredWorkerId();
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("remote_workers")
      .select("worker_id,last_seen_at,worker_status,nas_connected,updated_at")
      .eq("worker_id", workerId)
      .maybeSingle();

    if (error) {
      // Migration 적용 전에는 원격 기능 자체를 막지 않고 연결 상태를 unknown으로 제공한다.
      console.warn("[remote-workers status]", error.message);
      return Response.json({
        ok: true,
        worker: {
          id: workerId,
          online: null,
          last_seen_at: null,
          worker_status: null,
          nas_connected: null,
        },
      });
    }

    return Response.json({
      ok: true,
      worker: {
        id: workerId,
        online: data ? isRemoteWorkerOnline(data.last_seen_at) : false,
        last_seen_at: data?.last_seen_at ?? null,
        worker_status: data?.worker_status ?? null,
        nas_connected: data?.nas_connected ?? null,
      },
    });
  } catch (error) {
    console.error("[remote-workers status]", error);
    return Response.json({
      ok: true,
      worker: {
        id: workerId,
        online: null,
        last_seen_at: null,
        worker_status: null,
        nas_connected: null,
      },
    });
  }
}
