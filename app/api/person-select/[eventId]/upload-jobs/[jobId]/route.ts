import { NextRequest } from "next/server";
import { isAdminSession } from "@/lib/passkey";
import { refreshPersonSelectUploadJob } from "@/lib/person-select/uploadJobsServer";
import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

async function ownedJob(eventId: string, jobId: string) {
  const { data } = await getSupabaseAdmin().from("person_select_upload_jobs").select("*").eq("id", jobId).eq("event_id", eventId).maybeSingle();
  return data;
}

export async function GET(request: NextRequest, context: { params: Promise<{ eventId: string; jobId: string }> }) {
  if (!isAdminSession(request)) return Response.json({ ok: false, error: "관리자 로그인이 필요합니다." }, { status: 401 });
  const { eventId, jobId } = await context.params;
  const job = await ownedJob(eventId, jobId);
  if (!job) return Response.json({ ok: false, error: "업로드 작업을 찾을 수 없습니다." }, { status: 404 });
  const { data: files, error } = await getSupabaseAdmin().from("person_select_upload_job_files").select("relative_path,file_name,file_size,last_modified,idempotency_key,status,attempts,image_id,error,updated_at").eq("job_id", jobId).order("id");
  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });
  return Response.json({ ok: true, job, files: files ?? [] });
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ eventId: string; jobId: string }> }) {
  if (!isAdminSession(request)) return Response.json({ ok: false, error: "관리자 로그인이 필요합니다." }, { status: 401 });
  const { eventId, jobId } = await context.params;
  const job = await ownedJob(eventId, jobId);
  if (!job) return Response.json({ ok: false, error: "업로드 작업을 찾을 수 없습니다." }, { status: 404 });
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const action = body.action;
  const db = getSupabaseAdmin();
  const now = new Date().toISOString();
  if (action === "pause") {
    await db.from("person_select_upload_job_files").update({ status: "pending", updated_at: now }).eq("job_id", jobId).eq("status", "uploading");
    const { data, error } = await db.from("person_select_upload_jobs").update({ status: "paused", updated_at: now }).eq("id", jobId).select("*").single();
    return error ? Response.json({ ok: false, error: error.message }, { status: 500 }) : Response.json({ ok: true, job: data });
  }
  if (action === "resume" || action === "retry_failed") {
    if (action === "retry_failed") await db.from("person_select_upload_job_files").update({ status: "pending", error: null, updated_at: now }).eq("job_id", jobId).eq("status", "failed");
    const data = await refreshPersonSelectUploadJob(jobId, { keepStatus: "queued" });
    return Response.json({ ok: true, job: data });
  }
  if (action === "cancel") {
    await db.from("person_select_upload_job_files").update({ status: "canceled", updated_at: now }).eq("job_id", jobId).in("status", ["pending", "uploading", "failed"]);
    const data = await refreshPersonSelectUploadJob(jobId, { keepStatus: "canceled" });
    return Response.json({ ok: true, job: data });
  }
  if (action === "file_uploading" || action === "file_failed") {
    const relativePath = typeof body.relativePath === "string" ? body.relativePath.normalize("NFC") : "";
    if (!relativePath) return Response.json({ ok: false, error: "파일 경로가 필요합니다." }, { status: 400 });
    const status = action === "file_uploading" ? "uploading" : "failed";
    const update: Record<string, unknown> = {
      status,
      attempts: Number(body.attempts) || 1,
      error: action === "file_failed" ? String(body.error || "업로드 실패").slice(0, 1000) : null,
      updated_at: now,
    };
    if (action === "file_uploading") update.started_at = now;
    else update.completed_at = now;
    const { error } = await db.from("person_select_upload_job_files").update(update)
      .eq("job_id", jobId)
      .eq("relative_path", relativePath)
      .in("status", action === "file_uploading" ? ["pending", "failed"] : ["uploading", "pending"]);
    if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });
    const data = await refreshPersonSelectUploadJob(jobId, { error: action === "file_failed" ? String(body.error || "업로드 실패").slice(0, 1000) : null });
    return Response.json({ ok: true, job: data });
  }
  return Response.json({ ok: false, error: "지원하지 않는 작업입니다." }, { status: 400 });
}
