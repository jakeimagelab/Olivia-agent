import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import {
  ensurePhotoStorageEvent,
  isInternalPhotoStorageRequest,
  parseNonNegativeInteger,
  parseOptionalIsoDate,
  type PhotoProjectStatus,
  validatePhotoProjectRelativePath,
} from "@/lib/photo-storage/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const REPORTABLE_STATUSES = new Set<PhotoProjectStatus>(["READY", "REVIEW_REQUIRED", "ERROR"]);

export async function POST(request: NextRequest) {
  if (!isInternalPhotoStorageRequest(request)) {
    return Response.json({ ok: false, error: "Unauthorized photo watcher" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  try {
    const projectName = typeof body.project_name === "string" ? body.project_name.trim() : "";
    if (!projectName) throw new Error("project_name이 필요합니다.");
    const sourcePath = validatePhotoProjectRelativePath(body.source_relative_path);
    const statusValue = typeof body.status === "string" ? body.status.toUpperCase() as PhotoProjectStatus : null;
    if (!statusValue || !REPORTABLE_STATUSES.has(statusValue)) throw new Error("허용되지 않은 프로젝트 상태입니다.");
    const rawCount = parseNonNegativeInteger(body.raw_count, "raw_count");
    const jpgCount = parseNonNegativeInteger(body.jpg_count, "jpg_count");
    const jpgBytes = parseNonNegativeInteger(body.jpg_bytes, "jpg_bytes");
    const fingerprint = body.fingerprint === undefined || body.fingerprint === null ? null : String(body.fingerprint).slice(0, 512);
    const discoveredAt = parseOptionalIsoDate(body.discovered_at, "discovered_at") ?? new Date().toISOString();
    const preparedAt = parseOptionalIsoDate(body.prepared_at, "prepared_at");
    const message = typeof body.message === "string" ? body.message.trim().slice(0, 400) : null;

    const db = getSupabaseAdmin();
    const { data: existing, error: existingError } = await db
      .from("photo_storage_projects")
      .select("*")
      .eq("source_relative_path", sourcePath)
      .maybeSingle();
    if (existingError) throw existingError;

    // 사용자가 승인/보류한 상태는 Watcher 재시작·재전송으로 READY로 되돌리지 않는다.
    const preservedStatus: PhotoProjectStatus = existing?.status === "APPROVED" || existing?.status === "DEFERRED"
      ? existing.status
      : statusValue;
    const patch = {
      project_name: projectName,
      source_relative_path: sourcePath,
      status: preservedStatus,
      raw_count: rawCount,
      jpg_count: jpgCount,
      jpg_bytes: jpgBytes,
      fingerprint,
      ...(preparedAt ? { prepared_at: preparedAt } : {}),
      updated_at: new Date().toISOString(),
    };

    const query = existing
      ? db.from("photo_storage_projects").update(patch).eq("id", existing.id)
      : db.from("photo_storage_projects").insert({ ...patch, discovered_at: discoveredAt });
    const { data: project, error: saveError } = await query.select("*").single();
    if (saveError || !project) throw saveError ?? new Error("촬영 프로젝트 저장에 실패했습니다.");

    let eventCreated = false;
    if (preservedStatus === statusValue) {
      const eventResult = await ensurePhotoStorageEvent(db, {
        projectId: project.id,
        projectName,
        status: statusValue,
        payload: { source_relative_path: sourcePath, raw_count: rawCount, jpg_count: jpgCount, jpg_bytes: jpgBytes, ...(message ? { message } : {}) },
      });
      eventCreated = eventResult.created;
    }

    return Response.json({ ok: true, project, event_created: eventCreated });
  } catch (error) {
    const message = error instanceof Error ? error.message : "촬영 프로젝트 보고에 실패했습니다.";
    return Response.json({ ok: false, error: message }, { status: 400 });
  }
}
