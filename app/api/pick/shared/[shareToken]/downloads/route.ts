import { createHash } from "node:crypto";
import type { NextRequest } from "next/server";
import { ensurePersonSelectDownloadBucket, parseDownloadRequest, PERSON_SELECT_DOWNLOAD_BUCKET } from "@/lib/person-select/downloads";
import { resolveSharedPersonSelectAccess } from "@/lib/person-select/sharedPublic";
import { enforcePublicSelectionRateLimit, publicSelectionErrorResponse, readPublicSelectionJson } from "@/lib/select-gallery/publicSelection";
import { getConfiguredWorkerId } from "@/lib/remoteWorkerAuth";
import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

function ipHash(request: NextRequest) {
  const raw = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  return createHash("sha256").update(`${process.env.PERSON_SELECT_SESSION_SECRET ?? "person-select"}:${raw}`).digest("hex");
}
export async function POST(request: NextRequest, context: { params: Promise<{ shareToken: string }> }) {
  const { shareToken } = await context.params;
  try {
    const db = getSupabaseAdmin();
    await enforcePublicSelectionRateLimit({ db, request, token: shareToken, action: "person-shared-download-create", limit: 6, windowSeconds: 300 });
    const { event, reviewer } = await resolveSharedPersonSelectAccess(db, shareToken);
    const parsed = parseDownloadRequest(await readPublicSelectionJson(request, 300_000));
    if (parsed.format === "jpg" && !reviewer.can_download_jpg) return Response.json({ ok: false, error: "JPG 원본 다운로드 권한이 없습니다." }, { status: 403 });
    if (parsed.format === "raw" && !reviewer.can_download_raw) return Response.json({ ok: false, error: "RAW 원본 다운로드 권한이 없습니다." }, { status: 403 });
    if (!event.source_relative_path) return Response.json({ ok: false, error: "관리자가 원본 폴더를 연결하지 않았습니다." }, { status: 409 });
    const { data: images, error: imageError } = await db.from("person_select_images").select("id").eq("event_id", event.id).in("id", parsed.imageIds);
    if (imageError) throw imageError;
    if ((images ?? []).length !== parsed.imageIds.length) return Response.json({ ok: false, error: "다른 프로젝트의 사진은 다운로드할 수 없습니다." }, { status: 400 });
    const { data: existing } = await db.from("person_select_download_jobs").select("*").eq("event_id", event.id).eq("reviewer_id", reviewer.id).eq("request_key", parsed.requestKey).maybeSingle();
    if (existing) return Response.json({ ok: true, created: false, job: existing });
    const { data: job, error: jobError } = await db.from("person_select_download_jobs").insert({ event_id: event.id, reviewer_id: reviewer.id, format: parsed.format, image_ids: parsed.imageIds, request_key: parsed.requestKey, total_count: parsed.imageIds.length, status: "queued" }).select("*").single();
    if (jobError || !job) throw jobError ?? new Error("다운로드 작업을 만들지 못했습니다.");
    const { data: remote, error: remoteError } = await db.from("remote_jobs").insert({ action: "PERSON_SELECT_DOWNLOAD", payload: { download_job_id: job.id }, target_worker: getConfiguredWorkerId(), status: "QUEUED" }).select("id").single();
    if (remoteError || !remote) throw remoteError ?? new Error("Mac Studio 다운로드 작업을 만들지 못했습니다.");
    await Promise.all([
      db.from("person_select_download_jobs").update({ remote_job_id: remote.id, updated_at: new Date().toISOString() }).eq("id", job.id),
      db.from("person_select_download_audit").insert({ event_id: event.id, reviewer_id: reviewer.id, download_job_id: job.id, action: "requested", image_count: parsed.imageIds.length, request_ip_hash: ipHash(request) }),
    ]);
    return Response.json({ ok: true, created: true, job: { ...job, remote_job_id: remote.id } }, { status: 201 });
  } catch (error) { return publicSelectionErrorResponse(error); }
}
export async function GET(request: NextRequest, context: { params: Promise<{ shareToken: string }> }) {
  const { shareToken } = await context.params;
  try {
    const db = getSupabaseAdmin();
    await enforcePublicSelectionRateLimit({ db, request, token: shareToken, action: "person-shared-download-read", limit: 120 });
    const { event, reviewer } = await resolveSharedPersonSelectAccess(db, shareToken);
    const jobId = request.nextUrl.searchParams.get("jobId");
    if (!jobId) return Response.json({ ok: false, error: "다운로드 작업 ID가 필요합니다." }, { status: 400 });
    const { data: job, error } = await db.from("person_select_download_jobs").select("*").eq("id", jobId).eq("event_id", event.id).eq("reviewer_id", reviewer.id).maybeSingle();
    if (error) throw error;
    if (!job) return Response.json({ ok: false, error: "다운로드 작업을 찾을 수 없습니다." }, { status: 404 });
    let downloadUrl: string | null = null;
    if (["completed", "partial_failed"].includes(job.status) && job.storage_path) {
      await ensurePersonSelectDownloadBucket();
      const { data, error: signError } = await db.storage.from(PERSON_SELECT_DOWNLOAD_BUCKET).createSignedUrl(job.storage_path, 300, { download: `${event.title}-${job.format}.zip` });
      if (signError) throw signError;
      downloadUrl = data.signedUrl;
      await db.from("person_select_download_audit").insert({ event_id: event.id, reviewer_id: reviewer.id, download_job_id: job.id, action: "link_issued", image_count: job.total_count, request_ip_hash: ipHash(request) });
    }
    return Response.json({ ok: true, job: { ...job, storage_path: undefined }, downloadUrl });
  } catch (error) { return publicSelectionErrorResponse(error); }
}
