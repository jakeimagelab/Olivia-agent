import { NextRequest } from "next/server";
import { isAdminSession } from "@/lib/passkey";
import { deriveLocalImportRecord, type PersonSelectImportLayout } from "@/lib/person-select/localImport";
import { readAllPersonSelectRows } from "@/lib/person-select/paging";
import { uploadFileIdempotencyKey, type UploadManifestFile } from "@/lib/person-select/uploadQueue";
import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";
const MAX_FILES = 5_000;

function readLayout(value: unknown): PersonSelectImportLayout | null {
  return value === "school" || value === "person-folders" || value === "project" ? value : null;
}

function readFiles(value: unknown, layout: PersonSelectImportLayout) {
  if (!Array.isArray(value) || !value.length || value.length > MAX_FILES) throw new Error(`업로드 파일은 1~${MAX_FILES.toLocaleString()}장이어야 합니다.`);
  const files: UploadManifestFile[] = [];
  const seen = new Set<string>();
  for (const raw of value) {
    const row = raw && typeof raw === "object" ? raw as Record<string, unknown> : null;
    const relativePath = typeof row?.relativePath === "string" ? row.relativePath.normalize("NFC") : "";
    const fileName = typeof row?.fileName === "string" ? row.fileName.normalize("NFC") : "";
    const size = Number(row?.size);
    const lastModified = Number(row?.lastModified);
    const derived = deriveLocalImportRecord(layout, relativePath);
    if (!derived || derived.fileName !== fileName || !Number.isFinite(size) || size < 0 || !Number.isFinite(lastModified) || lastModified < 0) throw new Error(`올바르지 않은 파일입니다: ${relativePath || fileName || "빈 경로"}`);
    if (seen.has(derived.relativePath)) continue;
    seen.add(derived.relativePath);
    files.push({ relativePath: derived.relativePath, fileName, size, lastModified, idempotencyKey: uploadFileIdempotencyKey({ relativePath: derived.relativePath, size, lastModified }) });
  }
  return files;
}

export async function GET(request: NextRequest, context: { params: Promise<{ eventId: string }> }) {
  if (!isAdminSession(request)) return Response.json({ ok: false, error: "관리자 로그인이 필요합니다." }, { status: 401 });
  const { eventId } = await context.params;
  const limit = Math.min(30, Math.max(1, Number(request.nextUrl.searchParams.get("limit")) || 10));
  const { data, error } = await getSupabaseAdmin().from("person_select_upload_jobs").select("*").eq("event_id", eventId).order("created_at", { ascending: false }).limit(limit);
  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });
  return Response.json({ ok: true, jobs: data ?? [] });
}

export async function POST(request: NextRequest, context: { params: Promise<{ eventId: string }> }) {
  if (!isAdminSession(request)) return Response.json({ ok: false, error: "관리자 로그인이 필요합니다." }, { status: 401 });
  const { eventId } = await context.params;
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const layout = readLayout(body?.layout);
  if (!layout) return Response.json({ ok: false, error: "사진 폴더 방식을 확인해 주세요." }, { status: 400 });
  let files: UploadManifestFile[];
  try { files = readFiles(body?.files, layout); }
  catch (error) { return Response.json({ ok: false, error: error instanceof Error ? error.message : "파일 목록을 확인해 주세요." }, { status: 400 }); }

  const db = getSupabaseAdmin();
  const [{ data: event }, existingImages, { data: activeJob }] = await Promise.all([
    db.from("person_select_events").select("id,title").eq("id", eventId).maybeSingle(),
    readAllPersonSelectRows((from, to) => db.from("person_select_images").select("id,source_rel_path").eq("event_id", eventId).order("id").range(from, to)),
    db.from("person_select_upload_jobs").select("*").eq("event_id", eventId).in("status", ["queued", "uploading", "paused"]).order("created_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  if (!event) return Response.json({ ok: false, error: "프로젝트를 찾을 수 없습니다." }, { status: 404 });
  if (activeJob) return Response.json({ ok: false, error: "이 프로젝트에서 이미 진행 중인 업로드가 있습니다. 같은 폴더를 다시 선택해 이어서 진행해 주세요.", job: activeJob }, { status: 409 });
  const imagesByPath = new Map(existingImages.map((image) => [String(image.source_rel_path), String(image.id)]));
  const completed = files.filter((file) => imagesByPath.has(file.relativePath)).length;
  const now = new Date().toISOString();
  const { data: job, error: jobError } = await db.from("person_select_upload_jobs").insert({
    event_id: eventId,
    project_title: event.title,
    source_name: typeof body?.sourceName === "string" ? body.sourceName.slice(0, 500) : "로컬 폴더",
    layout,
    status: completed === files.length ? "completed" : "queued",
    total_count: files.length,
    success_count: completed,
    pending_count: files.length - completed,
    needs_file_reselection: false,
    completed_at: completed === files.length ? now : null,
  }).select("*").single();
  if (jobError || !job) return Response.json({ ok: false, error: jobError?.message || "업로드 작업을 만들지 못했습니다." }, { status: 500 });

  for (let offset = 0; offset < files.length; offset += 500) {
    const rows = files.slice(offset, offset + 500).map((file) => ({
      job_id: job.id,
      event_id: eventId,
      relative_path: file.relativePath,
      file_name: file.fileName,
      file_size: file.size,
      last_modified: file.lastModified,
      idempotency_key: file.idempotencyKey,
      status: imagesByPath.has(file.relativePath) ? "completed" : "pending",
      image_id: imagesByPath.get(file.relativePath) ?? null,
      completed_at: imagesByPath.has(file.relativePath) ? now : null,
    }));
    const { error } = await db.from("person_select_upload_job_files").insert(rows);
    if (error) {
      await db.from("person_select_upload_jobs").update({ status: "failed", error: error.message, completed_at: now, updated_at: now }).eq("id", job.id);
      return Response.json({ ok: false, error: error.message }, { status: 500 });
    }
  }
  return Response.json({ ok: true, job, completedPaths: [...imagesByPath.keys()].filter((path) => files.some((file) => file.relativePath === path)) }, { status: 201 });
}
