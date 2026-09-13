import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { isAdminSession } from "@/lib/passkey";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ALLOWED_ACTIONS = new Set([
  "PING",
  "PHOTO_SORT",
]);

function isInternalRequest(request: NextRequest): boolean {
  const expected = process.env.INTERNAL_API_KEY;
  if (!expected) return false;

  return request.headers.get("x-internal-key") === expected;
}

function isAuthorized(request: NextRequest): boolean {
  return isAdminSession(request) || isInternalRequest(request);
}

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return Response.json(
      { ok: false, error: "관리자 로그인이 필요합니다." },
      { status: 401 }
    );
  }

  const body = await request.json().catch(() => ({}));

  const action =
    typeof body.action === "string"
      ? body.action.trim().toUpperCase()
      : "";

  if (!ALLOWED_ACTIONS.has(action)) {
    return Response.json(
      { ok: false, error: "지원하지 않는 작업입니다." },
      { status: 400 }
    );
  }

  const payload =
    body.payload &&
    typeof body.payload === "object" &&
    !Array.isArray(body.payload)
      ? body.payload
      : {};

  const targetWorker =
    typeof body.target_worker === "string" &&
    body.target_worker.trim()
      ? body.target_worker.trim()
      : process.env.OLIVIA_WORKER_ID || "jake-macstudio-01";

  try {
    const supabase = getSupabaseAdmin();

    const { data, error } = await supabase
      .from("remote_jobs")
      .insert({
        action,
        payload,
        target_worker: targetWorker,
        status: "QUEUED",
      })
      .select(
        "id,action,payload,target_worker,status,created_at"
      )
      .single();

    if (error) throw error;

    return Response.json({
      ok: true,
      job: data,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "작업 생성 실패";

    console.error("[remote-jobs POST]", error);

    return Response.json(
      { ok: false, error: message },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return Response.json(
      { ok: false, error: "관리자 로그인이 필요합니다." },
      { status: 401 }
    );
  }

  try {
    const supabase = getSupabaseAdmin();

    const { data, error } = await supabase
      .from("remote_jobs")
      .select(
        "id,action,target_worker,status,message,error,created_at,started_at,completed_at"
      )
      .order("created_at", { ascending: false })
      .limit(30);

    if (error) throw error;

    return Response.json({
      ok: true,
      jobs: data ?? [],
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "작업 조회 실패";

    return Response.json(
      { ok: false, error: message },
      { status: 500 }
    );
  }
}
