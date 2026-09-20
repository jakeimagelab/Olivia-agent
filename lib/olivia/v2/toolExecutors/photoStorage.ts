import { getSupabaseAdmin } from "@/lib/supabase";
import type { OliviaToolResult } from "@/lib/olivia/v2/types";
import { text } from "./common";
import { createVerification } from "./verification";
import { callOliviaApi } from "./http";

// 사진 스토리지 파이프라인(PHASE 6) 읽기 전용 조회 + 재시도 요청. 승인(1차/2차)은
// 언제나 사용자가 화면에서 직접 누른다 — 여기서 MERGE_APPROVED/CLASSIFY_APPROVED로
// 전이시키는 도구는 만들지 않는다. 실행 권한(파일 조작, 승인)은 기존 REST API가 그대로
// 갖고 있고, 이 executor는 그 API를 그대로 호출하거나 읽기만 한다.
export const PHOTO_STORAGE_TOOL_NAMES = [
  "list_photo_storage_projects", "get_photo_storage_status", "retry_photo_storage_project",
] as const;

type PhotoStorageProjectRow = Record<string, unknown>;

function stageError(project: PhotoStorageProjectRow): string | null {
  return (project.merge_error as string | null)
    || (project.copy_error as string | null)
    || (project.classification_error as string | null)
    || null;
}

function summarizeProject(project: PhotoStorageProjectRow) {
  return {
    projectId: project.id,
    projectName: project.project_name,
    status: project.status,
    rawCount: project.raw_count,
    jpgCount: project.jpg_count,
    mergedJpgCount: project.merged_jpg_count,
    rawUntouchedCount: project.raw_untouched_count,
    mergeConflictCount: project.merge_conflict_count,
    copiedJpgCount: project.copied_jpg_count,
    sceneCount: project.scene_count,
    classifiedJpgCount: project.classified_jpg_count,
    lastError: stageError(project),
    updatedAt: project.updated_at,
  };
}

export async function executePhotoStorageTool(
  name: string,
  input: Record<string, unknown>,
): Promise<OliviaToolResult> {
  const db = getSupabaseAdmin();

  if (name === "list_photo_storage_projects") {
    const { data, error } = await db
      .from("photo_storage_projects")
      .select("*")
      .order("updated_at", { ascending: false })
      .limit(20);
    if (error) throw new Error("촬영 프로젝트 목록을 불러오지 못했어요.");
    return {
      tool: name,
      success: true,
      data: { projects: (data ?? []).map(summarizeProject) },
      verification: createVerification({ executed: true }),
    };
  }

  if (name === "get_photo_storage_status") {
    const projectId = text(input, "projectId");
    const projectName = text(input, "projectName");
    if (!projectId && !projectName) throw new Error("어떤 촬영 프로젝트인지 이름이나 ID를 알려주세요.");
    let query = db.from("photo_storage_projects").select("*");
    query = projectId ? query.eq("id", projectId) : query.ilike("project_name", `%${projectName}%`);
    const { data, error } = await query.order("updated_at", { ascending: false }).limit(5);
    if (error) throw new Error("촬영 프로젝트 상태를 확인하지 못했어요.");
    if (!data?.length) throw new Error("해당 촬영 프로젝트를 찾지 못했어요.");
    if (data.length > 1 && !projectId) throw new Error("비슷한 이름의 프로젝트가 여러 건이에요. 정확한 프로젝트 이름을 알려주세요.");
    const project = data[0];
    const { data: events } = await db
      .from("photo_storage_events")
      .select("event_type,message,requires_action,created_at")
      .eq("project_id", project.id)
      .order("created_at", { ascending: false })
      .limit(5);
    const { data: jobs } = await db
      .from("remote_jobs")
      .select("id,action,status,progress,message,error,created_at,started_at,completed_at")
      .eq("payload->>project_id", project.id)
      .order("created_at", { ascending: false })
      .limit(10);
    return {
      tool: name,
      success: true,
      data: { project: summarizeProject(project), recentEvents: events ?? [], recentJobs: jobs ?? [] },
      verification: createVerification({ executed: true, resourceExists: true }),
    };
  }

  if (name === "retry_photo_storage_project") {
    const projectId = text(input, "projectId");
    if (!projectId) throw new Error("다시 시도할 촬영 프로젝트 ID를 알려주세요.");
    const payload = await callOliviaApi<{ project: PhotoStorageProjectRow; idempotent?: boolean }>(
      `/api/photo-storage/projects/${projectId}/retry`,
      { method: "POST" },
    );
    return {
      tool: name,
      success: true,
      data: { project: summarizeProject(payload.project), idempotent: Boolean(payload.idempotent) },
      verification: createVerification({ executed: true, persisted: true }),
    };
  }

  throw new Error("지원하지 않는 Olivia 작업이에요.");
}
