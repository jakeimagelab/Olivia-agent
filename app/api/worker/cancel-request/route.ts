import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { authorizeWorker } from "@/lib/remoteWorkerAuth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Mac Studio bridge 전용: 현재 claim한 작업의 취소 요청만 읽는다. */
export async function GET(request: NextRequest) {
  const workerId = authorizeWorker(request);
  if (!workerId) return Response.json({ ok: false, error: "Unauthorized worker" }, { status: 401 });
  const jobId = request.nextUrl.searchParams.get("job_id")?.trim() || "";
  if (!UUID_PATTERN.test(jobId)) return Response.json({ ok: false, error: "Invalid job_id" }, { status: 400 });

  try {
    const { data, error } = await getSupabaseAdmin()
      .from("remote_jobs")
      .select("status,cancel_requested_at")
      .eq("id", jobId)
      .eq("target_worker", workerId)
      .maybeSingle();
    if (error) throw error;
    if (!data) return Response.json({ ok: false, error: "Job not found" }, { status: 404 });
    return Response.json({
      ok: true,
      cancelRequested: data.status === "CANCELED" || Boolean(data.cancel_requested_at),
    });
  } catch (error) {
    return Response.json({ ok: false, error: error instanceof Error ? error.message : "Cancel state lookup failed" }, { status: 500 });
  }
}
