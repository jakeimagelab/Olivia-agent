import type { SupabaseClient } from "@supabase/supabase-js";
import { ensurePortalAccess } from "@/lib/clientPortal";
import { generateShareToken, getFileExpiresAt } from "@/lib/selectGallery";
import {
  buildFolderDateCandidates,
  syncManualShootingProgressAction,
  syncOriginalDeliveryRegisteredWorkflow,
  type ShootingProgressActionStage,
  type ShootingProgressManualState,
} from "./shootingProgress";

type ProjectRow = {
  id: string;
  project_name: string;
  source_relative_path: string;
  workflow_run_id?: string | null;
  calendar_task_id?: string | null;
  jpg_count?: number | null;
  discovered_at?: string | null;
};

type WorkflowRow = {
  id: string;
  client_id?: string | null;
  client_name?: string | null;
  shoot_date?: string | null;
};

type ClientRow = {
  id: string;
  hospital_name?: string | null;
  email?: string | null;
};

type GalleryRow = {
  id: string;
  share_token?: string | null;
};

export function normalizeExternalPhotoLink(value: unknown): string {
  const text = String(value ?? "").trim();
  if (!text) throw new Error("유그린 링크를 입력해주세요.");
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    throw new Error("http 또는 https로 시작하는 올바른 링크를 입력해주세요.");
  }
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) {
    throw new Error("http 또는 https 링크만 등록할 수 있습니다.");
  }
  return url.toString();
}

async function loadProject(db: SupabaseClient, projectId: string): Promise<ProjectRow> {
  const { data, error } = await db.from("photo_storage_projects")
    .select("id,project_name,source_relative_path,workflow_run_id,calendar_task_id,jpg_count,discovered_at")
    .eq("id", projectId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("촬영 프로젝트를 찾을 수 없습니다.");
  return data as ProjectRow;
}

async function loadWorkflow(db: SupabaseClient, workflowRunId: string | null | undefined): Promise<WorkflowRow | null> {
  if (!workflowRunId) return null;
  const { data, error } = await db.from("workflow_runs")
    .select("id,client_id,client_name,shoot_date")
    .eq("id", workflowRunId)
    .maybeSingle();
  if (error) throw error;
  return data as WorkflowRow | null;
}

async function loadClient(db: SupabaseClient, clientId: string | null | undefined): Promise<ClientRow | null> {
  if (!clientId) return null;
  const { data, error } = await db.from("clients")
    .select("id,hospital_name,email")
    .eq("id", clientId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("선택한 고객을 찾을 수 없습니다.");
  return data as ClientRow;
}

async function recordAction(
  db: SupabaseClient,
  input: {
    projectId: string;
    stage: ShootingProgressActionStage;
    state: ShootingProgressManualState;
    detail?: Record<string, unknown>;
  },
) {
  const now = new Date().toISOString();
  const label = input.state === "skipped" ? "건너뜀" : input.state === "restored" ? "건너뛰기 취소" : "완료";
  const { error } = await db.from("photo_storage_events").insert({
    project_id: input.projectId,
    event_type: "PHOTO_WORKFLOW_STEP_CHANGED",
    status: "ACKNOWLEDGED",
    message: `${input.stage} 단계 ${label}`,
    requires_action: false,
    payload: { stage: input.stage, state: input.state, ...input.detail },
    acknowledged_at: now,
  });
  if (error) throw error;
}

export async function registerOriginalDeliveryLink(
  db: SupabaseClient,
  input: { projectId: string; nasLink: unknown; clientId?: string | null; baseUrl: string },
) {
  const nasLink = normalizeExternalPhotoLink(input.nasLink);
  const project = await loadProject(db, input.projectId);
  const workflow = await loadWorkflow(db, project.workflow_run_id);
  const client = await loadClient(db, workflow?.client_id || input.clientId);
  const clientId = client?.id ?? workflow?.client_id ?? null;
  const now = new Date().toISOString();
  const shootDate = workflow?.shoot_date
    ?? buildFolderDateCandidates(project.project_name, new Date(project.discovered_at ?? now))[0]
    ?? null;

  const { data: existing, error: galleryReadError } = await db.from("select_galleries")
    .select("id,share_token")
    .eq("photo_storage_project_id", project.id)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (galleryReadError) throw galleryReadError;

  const shareToken = (existing as GalleryRow | null)?.share_token || generateShareToken();
  const galleryValues = {
    client_id: clientId,
    workflow_run_id: project.workflow_run_id ?? null,
    photo_storage_project_id: project.id,
    title: project.project_name,
    hospital_name: client?.hospital_name ?? workflow?.client_name ?? project.project_name,
    shooting_name: project.project_name,
    shooting_date: shootDate,
    share_token: shareToken,
    nas_link: nasLink,
    file_expires_at: getFileExpiresAt(30),
    status: "waiting_selection",
    allow_web_select: false,
    allow_download_upload: true,
    allow_download_zip: false,
    allow_resubmit: false,
    total_jpg_count: Math.max(0, Number(project.jpg_count ?? 0)),
    updated_at: now,
  };

  let gallery: GalleryRow;
  if (existing) {
    const { data, error } = await db.from("select_galleries")
      .update(galleryValues)
      .eq("id", existing.id)
      .select("id,share_token")
      .single();
    if (error || !data) throw error ?? new Error("셀렉 갤러리를 갱신하지 못했습니다.");
    gallery = data as GalleryRow;
  } else {
    const { data, error } = await db.from("select_galleries")
      .insert(galleryValues)
      .select("id,share_token")
      .single();
    if (error || !data) throw error ?? new Error("셀렉 갤러리를 만들지 못했습니다.");
    gallery = data as GalleryRow;
  }

  await syncOriginalDeliveryRegisteredWorkflow(db, project.workflow_run_id);
  await recordAction(db, {
    projectId: project.id,
    stage: "original_delivery",
    state: "completed",
    detail: { gallery_id: gallery.id },
  });

  let portalUrl: string | null = null;
  if (clientId) {
    const portal = await ensurePortalAccess({
      clientId,
      workflowRunId: project.workflow_run_id ?? null,
      email: client?.email ?? undefined,
    });
    portalUrl = `${input.baseUrl}/client-portal/access/${portal.token}`;
  }

  return {
    galleryId: gallery.id,
    selectionUrl: `${input.baseUrl}/select/${gallery.share_token || shareToken}`,
    portalUrl,
    clientId,
  };
}

export async function updateManualShootingProgress(
  db: SupabaseClient,
  input: {
    projectId: string;
    stage: ShootingProgressActionStage;
    state: ShootingProgressManualState;
  },
) {
  const project = await loadProject(db, input.projectId);
  await syncManualShootingProgressAction(db, {
    workflowRunId: project.workflow_run_id,
    stage: input.stage,
    state: input.state,
  });
  await recordAction(db, input);
  return { projectId: project.id, workflowRunId: project.workflow_run_id ?? null };
}
