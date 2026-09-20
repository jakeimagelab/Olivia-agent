import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabase";
import { createRemoteWorkerNasDataSource } from "@/lib/remote-nas/remoteNasDataSource";
import type { RemoteNasDataSource } from "@/lib/remote-nas/types";
import { resolveSinglePhotoFolderCandidate, type PhotoFolderCandidate } from "@/lib/photo-storage/photoFolderCatalog";
import type { OliviaContextSnapshot, OliviaToolResult } from "@/lib/olivia/v2/types";
import { OliviaToolError } from "@/lib/olivia/v2/toolError";
import { text } from "./common";
import { internalFetcher } from "./http";
import { createVerification } from "./verification";

export const PHOTO_OPERATION_TOOL_NAMES = [
  "start_photo_raw_match",
  "start_photo_resize",
  "start_photo_ai_select",
  "start_photo_retouch",
] as const;

type Dependencies = { dataSource?: RemoteNasDataSource; db?: SupabaseClient };
type RemoteAction = "PHOTO_RAW_MATCH" | "PHOTO_RESIZE" | "PHOTO_AI_SELECT" | "PHOTO_RETOUCH";

const defaultDataSource = createRemoteWorkerNasDataSource({ fetcher: internalFetcher });

function projectDisplayName(relativePath: string): string {
  return relativePath.split("/").at(-1) || relativePath;
}

async function ensureProject(db: SupabaseClient, candidate: PhotoFolderCandidate): Promise<{ id: string; status: string; created: boolean }> {
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

async function latestSubmittedSelection(db: SupabaseClient, folderName: string, galleryId?: string): Promise<{ selectionId: string; selectedFiles: string[] } | null> {
  let galleryQuery = db.from("select_galleries").select("id,hospital_name,submitted_at,created_at")
    .in("status", ["selection_submitted", "raw_matching", "raw_matched", "retouching", "completed"])
    .order("submitted_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(1);
  if (galleryId) galleryQuery = galleryQuery.eq("id", galleryId);
  else {
    const hospitalName = folderName.replace(/^\d{4}[_\s-]*/, "").replace(/\([^)]*\)\s*$/, "").trim();
    galleryQuery = galleryQuery.ilike("hospital_name", `%${hospitalName.replaceAll("%", "\\%").replaceAll("_", "\\_")}%`);
  }
  const { data: gallery, error: galleryError } = await galleryQuery.maybeSingle();
  if (galleryError) throw galleryError;
  if (!gallery?.id) return null;
  const { data: selection, error: selectionError } = await db.from("client_photo_selections")
    .select("id,selected_files,submitted_at")
    .eq("gallery_id", gallery.id)
    .order("submitted_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (selectionError) throw selectionError;
  const selectedFiles = Array.isArray(selection?.selected_files) ? selection.selected_files.filter((value): value is string => typeof value === "string" && Boolean(value.trim())) : [];
  return selection?.id && selectedFiles.length ? { selectionId: String(selection.id), selectedFiles } : null;
}

async function enqueueJob(db: SupabaseClient, input: {
  action: RemoteAction;
  projectId: string;
  payload: Record<string, unknown>;
  confirmRestart: boolean;
}): Promise<{ id: string; status: string; reused: boolean }> {
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
  if (previous?.status === "COMPLETED" && !input.confirmRestart) return { id: String(previous.id), status: "COMPLETED", reused: true };
  if (previous?.status === "FAILED" && !input.confirmRestart) {
    throw new OliviaToolError("이 작업은 이전에 실패했어요. 원본은 변경되지 않았습니다. 다시 시도할까요?", "PHOTO_OPERATION_RESTART_CONFIRMATION_REQUIRED", { jobId: previous.id, action: input.action });
  }

  const { data, error } = await db.from("remote_jobs").insert({
    action: input.action,
    payload: input.payload,
    target_worker: process.env.OLIVIA_WORKER_ID || "jake-macstudio-01",
    status: "QUEUED",
  }).select("id,status").single();
  if (error || !data) {
    // partial unique index와 경쟁한 경우 이미 만들어진 active job을 정상 결과로 돌려준다.
    const { data: raced } = await base().in("status", ["QUEUED", "RUNNING"]).maybeSingle();
    if (raced) return { id: String(raced.id), status: String(raced.status), reused: true };
    throw error ?? new Error("사진 원격 작업 생성에 실패했습니다.");
  }
  return { id: String(data.id), status: String(data.status), reused: false };
}

export async function executePhotoOperationTool(
  name: string,
  input: Record<string, unknown>,
  context: OliviaContextSnapshot,
  dependencies: Dependencies = {},
): Promise<OliviaToolResult> {
  void context;
  const folderName = text(input, "folderName");
  if (!folderName) throw new Error("작업할 촬영 폴더 이름이 필요해요.");
  const candidate = await resolveSinglePhotoFolderCandidate(folderName, dependencies.dataSource ?? defaultDataSource);
  const db = dependencies.db ?? getSupabaseAdmin();
  const project = await ensureProject(db, candidate);
  const confirmRestart = input.confirmRestart === true;

  let action: RemoteAction;
  let payload: Record<string, unknown> = { project_id: project.id, project_relative_path: candidate.sourceRelativePath };
  let operationLabel: string;

  if (name === "start_photo_raw_match") {
    action = "PHOTO_RAW_MATCH";
    operationLabel = "RAW 매칭";
    const galleryId = text(input, "galleryId");
    const selection = await latestSubmittedSelection(db, candidate.displayName, galleryId || undefined);
    if (selection) payload = { ...payload, selection_id: selection.selectionId, selected_file_names: selection.selectedFiles };
    // selection이 없으면 Runner가 XMP rating >= 1을 확인한다. 그것도 없으면 모든 사진을
    // 매칭하지 않고 REVIEW_REQUIRED로 정지한다.
  } else if (name === "start_photo_resize") {
    action = "PHOTO_RESIZE";
    operationLabel = "리사이즈";
    const longEdge = Number(input.longEdge ?? 4000);
    const quality = Number(input.quality ?? 95);
    if (!Number.isInteger(longEdge) || longEdge < 500 || longEdge > 10_000) throw new Error("긴 변 해상도는 500~10000px 정수여야 해요.");
    if (!Number.isInteger(quality) || quality < 1 || quality > 100) throw new Error("JPEG 품질은 1~100 정수여야 해요.");
    payload = { ...payload, input_relative_path: text(input, "inputRelativePath") || "씬별분류", long_edge: longEdge, quality };
  } else if (name === "start_photo_ai_select") {
    action = "PHOTO_AI_SELECT";
    operationLabel = "AI 셀렉";
    payload = { ...payload, input_relative_path: text(input, "inputRelativePath") || "씬별분류" };
  } else if (name === "start_photo_retouch") {
    action = "PHOTO_RETOUCH";
    operationLabel = "보정 분석";
    if (!Array.isArray(input.fileNames) || input.fileNames.length === 0) throw new Error("보정 분석할 사진 파일명을 알려주세요. 임의로 전체 사진을 분석하지 않아요.");
    payload = { ...payload, file_names: input.fileNames, check_type: input.checkType === "gown" ? "gown" : "skin" };
  } else {
    throw new Error("지원하지 않는 사진 작업이에요.");
  }

  const job = await enqueueJob(db, { action, projectId: project.id, payload, confirmRestart });
  const summary = job.status === "COMPLETED"
    ? `"${candidate.displayName}" ${operationLabel}은(는) 이미 완료되어 있어요.`
    : job.reused
      ? `"${candidate.displayName}" ${operationLabel} 작업이 이미 ${job.status === "RUNNING" ? "진행 중" : "대기 중"}이에요.`
      : `"${candidate.displayName}" ${operationLabel} 작업을 Mac Studio에 주문했어요.`;
  return {
    tool: name,
    success: true,
    data: { projectId: project.id, jobId: job.id, status: job.status, action, folderName: candidate.displayName, sourceRelativePath: candidate.sourceRelativePath, createdProject: project.created, summary },
    verification: createVerification({ executed: true, persisted: true, resourceExists: true, details: { projectId: project.id, jobId: job.id } }),
  };
}
