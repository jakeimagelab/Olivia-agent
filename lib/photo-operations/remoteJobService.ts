import type { SupabaseClient } from "@supabase/supabase-js";
import type { PhotoFolderCandidate } from "@/lib/photo-storage/photoFolderCatalog";
import { OliviaToolError } from "@/lib/olivia/v2/toolError";

export type PhotoOperationRemoteAction = "PHOTO_RAW_MATCH" | "PHOTO_RESIZE" | "PHOTO_AI_SELECT" | "PHOTO_RETOUCH";

export type PhotoOperationProject = {
  id: string;
  status: string;
  created: boolean;
};

export type PhotoOperationJob = {
  id: string;
  status: string;
  reused: boolean;
};

function projectDisplayName(relativePath: string): string {
  return relativePath.split("/").at(-1) || relativePath;
}

export async function ensurePhotoOperationProject(
  db: SupabaseClient,
  candidate: Pick<PhotoFolderCandidate, "sourceRelativePath" | "displayName" | "rawCount" | "jpgCount" | "jpgBytes">,
): Promise<PhotoOperationProject> {
  const { data: existing, error: readError } = await db.from("photo_storage_projects")
    .select("id,status")
    .eq("source_relative_path", candidate.sourceRelativePath)
    .maybeSingle();
  if (readError) throw readError;
  if (existing) return { id: String(existing.id), status: String(existing.status), created: false };

  const now = new Date().toISOString();
  const { data, error } = await db.from("photo_storage_projects").insert({
    project_name: candidate.displayName || projectDisplayName(candidate.sourceRelativePath),
    source_relative_path: candidate.sourceRelativePath,
    status: "READY",
    raw_count: candidate.rawCount,
    jpg_count: candidate.jpgCount,
    jpg_bytes: candidate.jpgBytes,
    discovered_at: now,
    updated_at: now,
  }).select("id,status").single();
  if (error || !data) throw error ?? new Error("사진 프로젝트 등록에 실패했습니다.");
  return { id: String(data.id), status: String(data.status), created: true };
}

export async function enqueuePhotoOperationJob(db: SupabaseClient, input: {
  action: PhotoOperationRemoteAction;
  projectId: string;
  payload: Record<string, unknown>;
  confirmRestart: boolean;
  confirmCompletedRestart?: boolean;
}): Promise<PhotoOperationJob> {
  const base = () => db.from("remote_jobs").select("id,status,created_at")
    .eq("action", input.action)
    .eq("payload->>project_id", input.projectId)
    .order("created_at", { ascending: false })
    .limit(1);
  const { data: active, error: activeError } = await base().in("status", ["QUEUED", "RUNNING"]).maybeSingle();
  if (activeError) throw activeError;
  if (active) return { id: String(active.id), status: String(active.status), reused: true };

  const { data: previous, error: previousError } = await base().in("status", ["COMPLETED", "FAILED"]).maybeSingle();
  if (previousError) throw previousError;
  if (previous?.status === "COMPLETED" && !input.confirmRestart) {
    if (!input.confirmCompletedRestart) return { id: String(previous.id), status: "COMPLETED", reused: true };
    throw new OliviaToolError(
      "이 프로젝트의 작업이 이미 완료되어 있어요. 새 셀렉 결과로 다시 실행할까요?",
      "PHOTO_OPERATION_RESTART_CONFIRMATION_REQUIRED",
      { jobId: previous.id, action: input.action },
    );
  }
  if (previous?.status === "FAILED" && !input.confirmRestart) {
    throw new OliviaToolError(
      "이 작업은 이전에 실패했어요. 원본은 변경되지 않았습니다. 다시 시도할까요?",
      "PHOTO_OPERATION_RESTART_CONFIRMATION_REQUIRED",
      { jobId: previous.id, action: input.action },
    );
  }

  const { data, error } = await db.from("remote_jobs").insert({
    action: input.action,
    payload: input.payload,
    target_worker: process.env.OLIVIA_WORKER_ID || "jake-macstudio-01",
    status: "QUEUED",
  }).select("id,status").single();
  if (error || !data) {
    // 활성 작업 partial unique index와 경쟁한 경우 이미 생성된 작업을 재사용한다.
    const { data: raced } = await base().in("status", ["QUEUED", "RUNNING"]).maybeSingle();
    if (raced) return { id: String(raced.id), status: String(raced.status), reused: true };
    throw error ?? new Error("사진 원격 작업 생성에 실패했습니다.");
  }
  return { id: String(data.id), status: String(data.status), reused: false };
}
