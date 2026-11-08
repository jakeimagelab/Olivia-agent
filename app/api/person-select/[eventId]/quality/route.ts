import type { NextRequest } from "next/server";
import { isAdminSession } from "@/lib/passkey";
import { latestPhotoQualityResults, photoQualityCounts, publicPhotoQualityResult } from "@/lib/photo-quality/public";
import { PHOTO_QUALITY_ANALYSIS_VERSION, PHOTO_QUALITY_DEFAULT_MODEL } from "@/lib/photo-quality/types";
import { getConfiguredWorkerId } from "@/lib/remoteWorkerAuth";
import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

const RESULT_SELECT = "image_id,analysis_status,flags,confidence,explanation,review_status,analyzed_at";

export async function GET(request: NextRequest, context: { params: Promise<{ eventId: string }> }) {
  if (!isAdminSession(request)) return Response.json({ ok: false, error: "관리자 로그인이 필요합니다." }, { status: 401 });
  const { eventId } = await context.params;
  const db = getSupabaseAdmin();
  if (request.nextUrl.searchParams.get("jobOnly") === "1") {
    const { data: job, error } = await db.from("photo_quality_analysis_jobs").select("*").eq("event_id", eventId).order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });
    return Response.json({ ok: true, job });
  }
  const [{ data: results, error }, { data: job, error: jobError }] = await Promise.all([
    db.from("photo_quality_analysis_results").select(RESULT_SELECT).eq("event_id", eventId).eq("analysis_version", PHOTO_QUALITY_ANALYSIS_VERSION).order("analyzed_at", { ascending: false }),
    db.from("photo_quality_analysis_jobs").select("*").eq("event_id", eventId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  if (error || jobError) return Response.json({ ok: false, error: (error ?? jobError)?.message }, { status: 500 });
  const latest = latestPhotoQualityResults(results ?? []);
  return Response.json({ ok: true, results: latest.map(publicPhotoQualityResult), counts: photoQualityCounts(latest), job });
}
export async function POST(request: NextRequest, context: { params: Promise<{ eventId: string }> }) {
  if (!isAdminSession(request)) return Response.json({ ok: false, error: "관리자 로그인이 필요합니다." }, { status: 401 });
  const { eventId } = await context.params;
  const body = await request.json().catch(() => ({})) as { force?: boolean; consentAccepted?: boolean };
  if (body.consentAccepted !== true) {
    return Response.json({ ok: false, error: "외부 AI 서비스에 경량 미리보기를 전송하는 데 동의해야 검사를 시작할 수 있습니다." }, { status: 400 });
  }
  const db = getSupabaseAdmin();
  const [{ data: event }, { data: images, error: imageError }] = await Promise.all([
    db.from("person_select_events").select("id,title").eq("id", eventId).maybeSingle(),
    db.from("person_select_images").select("id").eq("event_id", eventId).order("sort_order").order("id"),
  ]);
  if (!event) return Response.json({ ok: false, error: "프로젝트를 찾을 수 없습니다." }, { status: 404 });
  if (imageError) return Response.json({ ok: false, error: imageError.message }, { status: 500 });
  if (!images?.length) return Response.json({ ok: false, error: "분석할 사진이 없습니다." }, { status: 409 });

  const { data: active } = await db.from("photo_quality_analysis_jobs").select("*").eq("event_id", eventId).in("status", ["queued", "running", "paused"]).maybeSingle();
  if (active) return Response.json({ ok: true, created: false, job: active });

  const { data: job, error: jobError } = await db.from("photo_quality_analysis_jobs").insert({
    event_id: eventId,
    requested_by: "admin",
    analysis_version: PHOTO_QUALITY_ANALYSIS_VERSION,
    model: PHOTO_QUALITY_DEFAULT_MODEL,
    status: "queued",
    total_count: images.length,
  }).select("*").single();
  if (jobError || !job) return Response.json({ ok: false, error: jobError?.message ?? "AI 검사 작업을 만들지 못했습니다." }, { status: 500 });

  const { error: itemError } = await db.from("photo_quality_analysis_job_items").insert(images.map((image) => ({
    job_id: job.id,
    event_id: eventId,
    image_id: image.id,
    status: "queued",
  })));
  if (itemError) {
    await db.from("photo_quality_analysis_jobs").update({ status: "failed", error: itemError.message, finished_at: new Date().toISOString() }).eq("id", job.id);
    return Response.json({ ok: false, error: itemError.message }, { status: 500 });
  }

  const { data: remoteJob, error: remoteError } = await db.from("remote_jobs").insert({
    action: "PERSON_SELECT_QUALITY",
    payload: { quality_job_id: job.id, event_id: eventId, force: body.force === true },
    target_worker: getConfiguredWorkerId(),
    status: "PENDING",
  }).select("id").single();
  if (remoteError || !remoteJob) {
    await db.from("photo_quality_analysis_jobs").update({ status: "failed", error: remoteError?.message ?? "Worker 작업 생성 실패", finished_at: new Date().toISOString() }).eq("id", job.id);
    return Response.json({ ok: false, error: remoteError?.message ?? "Worker 작업을 만들지 못했습니다." }, { status: 500 });
  }
  await db.from("photo_quality_analysis_jobs").update({ remote_job_id: remoteJob.id, updated_at: new Date().toISOString() }).eq("id", job.id);
  return Response.json({ ok: true, created: true, job: { ...job, remote_job_id: remoteJob.id } }, { status: 201 });
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ eventId: string }> }) {
  if (!isAdminSession(request)) return Response.json({ ok: false, error: "관리자 로그인이 필요합니다." }, { status: 401 });
  const { eventId } = await context.params;
  const body = await request.json().catch(() => null) as { imageId?: string; reviewStatus?: string; action?: string } | null;
  const db = getSupabaseAdmin();
  if (body?.action && ["pause", "resume", "cancel", "retry"].includes(body.action)) {
    const { data: job, error: jobError } = await db.from("photo_quality_analysis_jobs").select("*").eq("event_id", eventId).order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (jobError) return Response.json({ ok: false, error: jobError.message }, { status: 500 });
    if (!job) return Response.json({ ok: false, error: "AI 검사 작업이 없습니다." }, { status: 404 });
    const now = new Date().toISOString();
    if (body.action === "pause") {
      if (!["queued", "running"].includes(job.status)) return Response.json({ ok: false, error: "진행 중인 검사만 일시정지할 수 있습니다." }, { status: 409 });
      const { data, error } = await db.from("photo_quality_analysis_jobs").update({ status: "paused", updated_at: now }).eq("id", job.id).select("*").single();
      if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });
      return Response.json({ ok: true, job: data });
    }
    if (body.action === "resume") {
      if (job.status !== "paused") return Response.json({ ok: false, error: "일시정지한 검사만 이어서 진행할 수 있습니다." }, { status: 409 });
      const { data, error } = await db.from("photo_quality_analysis_jobs").update({ status: "running", updated_at: now }).eq("id", job.id).select("*").single();
      if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });
      return Response.json({ ok: true, job: data });
    }
    if (body.action === "cancel") {
      if (!["queued", "running", "paused"].includes(job.status)) return Response.json({ ok: false, error: "진행 중인 검사만 취소할 수 있습니다." }, { status: 409 });
      const { data, error } = await db.from("photo_quality_analysis_jobs").update({ status: "canceled", finished_at: now, updated_at: now }).eq("id", job.id).select("*").single();
      if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });
      return Response.json({ ok: true, job: data });
    }
    if (!["failed", "partial_failed"].includes(job.status)) return Response.json({ ok: false, error: "실패한 사진이 있는 검사만 재시도할 수 있습니다." }, { status: 409 });
    const { error: itemError } = await db.from("photo_quality_analysis_job_items").update({ status: "queued", error: null, started_at: null, finished_at: null }).eq("job_id", job.id).eq("status", "failed");
    if (itemError) return Response.json({ ok: false, error: itemError.message }, { status: 500 });
    const { data: remote, error: remoteError } = await db.from("remote_jobs").insert({
      action: "PERSON_SELECT_QUALITY",
      payload: { quality_job_id: job.id, event_id: eventId, force: false },
      target_worker: getConfiguredWorkerId(),
      status: "PENDING",
    }).select("id").single();
    if (remoteError || !remote) return Response.json({ ok: false, error: remoteError?.message ?? "Worker 재시도 작업을 만들지 못했습니다." }, { status: 500 });
    const { data, error } = await db.from("photo_quality_analysis_jobs").update({ status: "queued", failed_count: 0, remote_job_id: remote.id, error: null, finished_at: null, updated_at: now }).eq("id", job.id).select("*").single();
    if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });
    return Response.json({ ok: true, job: data });
  }
  if (!body?.imageId || !["confirmed_issue", "confirmed_normal", "unreviewed"].includes(body.reviewStatus ?? "")) {
    return Response.json({ ok: false, error: "검토 대상과 상태를 확인해 주세요." }, { status: 400 });
  }
  const { data: current, error: currentError } = await db.from("photo_quality_analysis_results")
    .select("id")
    .eq("event_id", eventId)
    .eq("image_id", body.imageId)
    .eq("analysis_version", PHOTO_QUALITY_ANALYSIS_VERSION)
    .order("analyzed_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (currentError) return Response.json({ ok: false, error: currentError.message }, { status: 500 });
  if (!current) return Response.json({ ok: false, error: "검토할 AI 분석 결과가 없습니다." }, { status: 404 });
  const now = new Date().toISOString();
  const { data, error } = await db.from("photo_quality_analysis_results").update({
    review_status: body.reviewStatus,
    reviewed_by: body.reviewStatus === "unreviewed" ? null : "admin",
    reviewed_at: body.reviewStatus === "unreviewed" ? null : now,
    updated_at: now,
  }).eq("id", current.id).select(RESULT_SELECT).single();
  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });
  return Response.json({ ok: true, result: publicPhotoQualityResult(data) });
}
