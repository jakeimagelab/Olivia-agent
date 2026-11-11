import type { NextRequest } from "next/server";
import { getConfiguredWorkerId } from "@/lib/remoteWorkerAuth";
import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  if (!process.env.CRON_SECRET || request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  const db = getSupabaseAdmin();
  const { data: active } = await db.from("remote_jobs").select("id,status")
    .eq("action", "PERSON_SELECT_DELIVERY_PURGE").in("status", ["QUEUED", "RUNNING"]).limit(1).maybeSingle();
  if (active) return Response.json({ ok: true, job: active, reused: true });
  const { data, error } = await db.from("remote_jobs").insert({
    action: "PERSON_SELECT_DELIVERY_PURGE",
    payload: {},
    target_worker: getConfiguredWorkerId(),
    status: "QUEUED",
  }).select("id,status").single();
  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });
  return Response.json({ ok: true, job: data, reused: false });
}
