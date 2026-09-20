import { getSupabaseAdmin } from "@/lib/supabase";
import {
  PhotoPipelineStartError,
  startNasBackupClassification,
  startPhotoSourcePreparation,
} from "@/lib/photo-storage/nasClassifyHandoff";
import {
  findPhotoFolderCandidates,
  resolveSinglePhotoFolderCandidate,
} from "@/lib/photo-storage/photoFolderCatalog";
import { createRemoteWorkerNasDataSource } from "@/lib/remote-nas/remoteNasDataSource";
import type { RemoteNasDataSource } from "@/lib/remote-nas/types";
import type { OliviaContextSnapshot, OliviaToolResult } from "@/lib/olivia/v2/types";
import { OliviaToolError } from "@/lib/olivia/v2/toolError";
import { text } from "./common";
import { internalFetcher } from "./http";
import { createVerification } from "./verification";

// NAS Backup Watcher — Phase 2 §5. Watcher 자체(Mac Studio nas-backup-watcher.ts)는 건드리지
// 않는다 — 여기는 조회 + 승인된 후속 작업(분류 시작)만 제공한다.
export const NAS_BACKUP_TOOL_NAMES = [
  "nas_backup_status", "nas_backup_recent", "nas_backup_get", "nas_backup_start_sort",
  "find_photo_folder", "start_photo_source_prep", "start_photo_scene_sort",
] as const;

const EVENT_COLUMNS = "id,worker_id,event_type,source,source_root,folder_name,file_count,total_bytes,status,payload,created_at,acknowledged_at";
const defaultDataSource = createRemoteWorkerNasDataSource({ fetcher: internalFetcher });

type NasBackupToolDependencies = { dataSource?: RemoteNasDataSource };

async function readProjectByPath(db: ReturnType<typeof getSupabaseAdmin>, sourceRelativePath: string) {
  const { data, error } = await db
    .from("photo_storage_projects")
    .select("id,project_name,source_relative_path,status,raw_count,jpg_count,jpg_bytes,updated_at")
    .eq("source_relative_path", sourceRelativePath)
    .maybeSingle();
  if (error) throw error;
  return data as Record<string, unknown> | null;
}

function rethrowPipelineStartError(error: unknown): never {
  if (error instanceof PhotoPipelineStartError) {
    throw new OliviaToolError(error.message, error.code, error.details);
  }
  throw error;
}

// GET/PATCH /api/worker/events(/[id])는 관리자 세션 인증만 받는다(x-internal-key 미지원,
// 라우트 인증을 이번 Phase에서 바꾸지 않는다) — 그래서 조회 3종은 photoStorage.ts 도구들과
// 동일하게 Supabase를 직접 조회한다. worker_events는 삭제하지 않는다(§12 "이벤트 삭제 금지").
async function queryWorkerEvents(filter: (query: any) => any) {
  const db = getSupabaseAdmin();
  const { data, error } = await filter(db.from("worker_events").select(EVENT_COLUMNS));
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function executeNasBackupTool(
  name: string,
  input: Record<string, unknown>,
  context: OliviaContextSnapshot,
  dependencies: NasBackupToolDependencies = {},
): Promise<OliviaToolResult> {
  void context;

  const dataSource = dependencies.dataSource ?? defaultDataSource;

  if (name === "find_photo_folder") {
    const query = text(input, "query");
    const candidates = await findPhotoFolderCandidates(query, dataSource);
    const db = getSupabaseAdmin();
    const enriched = [];
    for (const candidate of candidates) {
      const project = await readProjectByPath(db, candidate.sourceRelativePath);
      enriched.push({
        ...candidate,
        projectId: project?.id ?? null,
        projectStatus: project?.status ?? "UNREGISTERED",
      });
    }
    return {
      tool: name,
      success: true,
      data: {
        query,
        candidates: enriched,
        ambiguous: enriched.length > 1,
        summary: enriched.length === 0
          ? `"${query}"와 일치하는 촬영 폴더가 없어요.`
          : enriched.length === 1
            ? `"${enriched[0].displayName}" 폴더를 찾았어요.`
            : `"${query}"와 비슷한 촬영 폴더가 ${enriched.length}개 있어요. 어느 폴더인지 선택해주세요.`,
      },
      verification: createVerification({ executed: true }),
    };
  }

  if (name === "nas_backup_status") {
    const rows = await queryWorkerEvents((query) => query.order("created_at", { ascending: false }).limit(200));
    const byStatus: Record<string, number> = {};
    for (const row of rows as Array<{ status: string }>) byStatus[row.status] = (byStatus[row.status] ?? 0) + 1;
    const pending = byStatus.PENDING ?? 0;
    return {
      tool: name,
      success: true,
      data: { byStatus, pendingCount: pending, summary: pending > 0 ? `새로 감지된 백업이 ${pending}건 있어요.` : "새로 감지된 백업이 없어요." },
      verification: createVerification({ executed: true }),
    };
  }

  if (name === "nas_backup_recent") {
    const limit = Math.min(Math.max(Number(input.limit) || 10, 1), 50);
    const rows = await queryWorkerEvents((query) => query.order("created_at", { ascending: false }).limit(limit));
    return { tool: name, success: true, data: { events: rows }, verification: createVerification({ executed: true }) };
  }

  if (name === "nas_backup_get") {
    const id = text(input, "id");
    if (!id) throw new Error("조회할 이벤트 ID가 필요해요.");
    const rows = await queryWorkerEvents((query) => query.eq("id", id).limit(1));
    const event = rows[0];
    if (!event) throw new Error("해당 백업 이벤트를 찾지 못했어요.");
    return { tool: name, success: true, data: { event }, verification: createVerification({ executed: true }) };
  }

  if (name === "start_photo_source_prep") {
    const folderName = text(input, "folderName");
    if (!folderName) throw new Error("JPG를 통합할 폴더 이름이 필요해요.");
    const candidate = await resolveSinglePhotoFolderCandidate(folderName, dataSource);
    const db = getSupabaseAdmin();
    const existing = await readProjectByPath(db, candidate.sourceRelativePath);
    try {
      const project = await startPhotoSourcePreparation(db, {
        folderName: candidate.sourceRelativePath,
        rawCount: candidate.rawCount,
        jpgCount: candidate.jpgCount,
        jpgBytes: candidate.jpgBytes,
        confirmRestart: input.confirmRestart === true,
        approvedBy: "olivia-chat",
      });
      return {
        tool: name,
        success: true,
        data: {
          projectId: project.id,
          folderName: candidate.displayName,
          sourceRelativePath: candidate.sourceRelativePath,
          status: project.status,
          createdProject: !existing,
          summary: project.status === "MERGE_COMPLETED"
            ? `"${candidate.displayName}"은(는) 이미 JPG 통합이 완료되어 있어요.`
            : `"${candidate.displayName}" JPG 통합 작업을 주문했어요.`,
        },
        verification: createVerification({ executed: true, persisted: true, resourceExists: true, details: { projectId: project.id } }),
      };
    } catch (error) {
      rethrowPipelineStartError(error);
    }
  }

  if (name === "nas_backup_start_sort" || name === "start_photo_scene_sort") {
    const folderName = text(input, "folderName");
    if (!folderName) throw new Error("분류를 시작할 폴더 이름이 필요해요.");
    // department/shootingMode는 절대 추측하지 않는다 — BackupReadyNotifications.tsx의 "분류 시작"
    // 버튼도 같은 이유로 자동 채우지 않는다(잘못된 진료과/촬영모드로 분류가 실행되면 되돌리기
    // 어렵다). add_quote_item의 unitPrice와 동일한 원칙: 대화에 없으면 Hermes가 사용자에게
    // 반드시 물어보게 한다(스키마에서 required로 강제).
    const department = text(input, "department");
    const shootingMode = text(input, "shootingMode");
    if (!department) throw new Error("진료과(department)를 알려주세요 — 추측해서 분류를 시작하지 않아요.");
    if (shootingMode !== "field" && shootingMode !== "studio") throw new Error("촬영 모드(field 또는 studio)를 알려주세요 — 추측해서 분류를 시작하지 않아요.");

    // mutation 직전에 live NAS 후보를 다시 확인한다. 부분 이름이 여러 폴더에 걸리면 프로젝트 행과
    // job을 만들지 않는다. NFD raw path는 candidate.sourceRelativePath를 그대로 사용한다.
    const candidate = await resolveSinglePhotoFolderCandidate(folderName, dataSource);
    const db = getSupabaseAdmin();
    const existing = await readProjectByPath(db, candidate.sourceRelativePath);
    let project;
    try {
      project = await startNasBackupClassification(db, {
        folderName: candidate.sourceRelativePath,
        department,
        shootingMode,
        rawCount: candidate.rawCount,
        jpgCount: candidate.jpgCount,
        jpgBytes: candidate.jpgBytes,
        confirmRestart: input.confirmRestart === true,
        approvedBy: "olivia-chat",
      });
    } catch (error) {
      rethrowPipelineStartError(error);
    }

    // worker_events row를 STARTED로 표시한다 — PATCH /api/worker/events/[id]도 GET과 마찬가지로
    // 관리자 세션 인증만 받아서(x-internal-key 미지원) 여기서 직접 호출할 수 없다(라우트 인증은
    // 이번 Phase에서 바꾸지 않는다, §24). 그 라우트가 하는 것과 정확히 같은 단일 컬럼 업데이트를
    // 그대로 반복한다 — 새 상태 전이 로직을 만드는 게 아니다.
    const eventId = text(input, "eventId");
    if (eventId) {
      await db.from("worker_events").update({ status: "STARTED" }).eq("id", eventId);
    }

    return {
      tool: name,
      success: true,
      data: {
        projectId: project.id,
        folderName: candidate.displayName,
        sourceRelativePath: candidate.sourceRelativePath,
        department,
        shootingMode,
        status: project.status,
        createdProject: !existing,
        summary: project.status === "CLASSIFY_COMPLETED"
          ? `"${candidate.displayName}"은(는) 이미 사진 분류가 완료되어 있어요.`
          : `"${candidate.displayName}"의 JPG 통합 → SSD2 복사 → Scene 분류 작업을 주문했어요.`,
      },
      verification: createVerification({ executed: true, persisted: true, resourceExists: true, details: { projectId: project.id } }),
    };
  }

  throw new Error("지원하지 않는 Olivia 작업이에요.");
}
