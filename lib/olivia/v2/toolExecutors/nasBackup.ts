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
import type { MedicalDepartment } from "@/lib/photo-classifier/types";
import { departmentFromPhotoText } from "@/lib/photo-classifier/departmentResolver";
import { isPhotoAutomationAvailable } from "@/lib/photo-storage/photoAutomation";

// NAS Backup Watcher — Phase 2 §5. Watcher 자체(Mac Studio nas-backup-watcher.ts)는 건드리지
// 않는다 — 여기는 조회 + 승인된 후속 작업(분류 시작)만 제공한다.
export const NAS_BACKUP_TOOL_NAMES = [
  "nas_backup_status", "nas_backup_recent", "nas_backup_get", "nas_backup_start_sort",
  "find_photo_folder", "start_photo_source_prep", "start_photo_scene_sort",
] as const;

const EVENT_COLUMNS = "id,worker_id,event_type,source,source_root,folder_name,file_count,total_bytes,status,payload,created_at,acknowledged_at";
const defaultDataSource = createRemoteWorkerNasDataSource({ fetcher: internalFetcher });
const RECENT_FOLDER_CANDIDATE_TTL_MS = 2 * 60 * 1000;

type RecentFolderCandidate = Awaited<ReturnType<typeof findPhotoFolderCandidates>>[number];
type RecentFolderCandidateEntry = { candidate: RecentFolderCandidate; verifiedAt: number };

// 한 채팅 turn에서 find_photo_folder가 이미 Workstation을 재귀 조회한 직후 start 도구가 같은
// 정확한 상대경로를 다시 재귀 조회하면, LIST_FOLDER job 수만큼 대기 시간이 두 배가 되어 Vercel
// stream의 60초 제한을 넘을 수 있다. 실제 Worker 응답으로 방금 검증한 후보만 dataSource 인스턴스별
// 짧은 TTL로 재사용한다. 부분 검색어에는 절대 사용하지 않으며, cache miss/만료 시 기존 전체
// resolveSinglePhotoFolderCandidate 검증으로 돌아간다. 실제 mutation preflight와 RAW 보호는 Worker의
// PHOTO_PREPARE_SOURCE/PHOTO_STAGE_JPG 파이프라인이 그대로 수행한다.
const recentFolderCandidates = new WeakMap<RemoteNasDataSource, Map<string, RecentFolderCandidateEntry>>();

function rememberFolderCandidates(dataSource: RemoteNasDataSource, candidates: RecentFolderCandidate[]): void {
  let entries = recentFolderCandidates.get(dataSource);
  if (!entries) {
    entries = new Map();
    recentFolderCandidates.set(dataSource, entries);
  }
  const verifiedAt = Date.now();
  for (const candidate of candidates) entries.set(candidate.sourceRelativePath, { candidate, verifiedAt });
}

function recentExactFolderCandidate(dataSource: RemoteNasDataSource, sourceRelativePath: string): RecentFolderCandidate | null {
  const entries = recentFolderCandidates.get(dataSource);
  const entry = entries?.get(sourceRelativePath);
  if (!entry) return null;
  if (Date.now() - entry.verifiedAt > RECENT_FOLDER_CANDIDATE_TTL_MS) {
    entries?.delete(sourceRelativePath);
    return null;
  }
  return entry.candidate;
}

async function resolvePhotoFolderForStart(folderName: string, dataSource: RemoteNasDataSource): Promise<RecentFolderCandidate> {
  // cache key가 정확한 sourceRelativePath와 일치할 때만 재사용한다. "르셀청담" 같은 부분 이름은
  // 기존 resolver를 거쳐 복수 후보 guard를 계속 적용한다.
  return recentExactFolderCandidate(dataSource, folderName)
    ?? resolveSinglePhotoFolderCandidate(folderName, dataSource);
}

type NasBackupToolDependencies = { dataSource?: RemoteNasDataSource };

// 폴더명에 드러난 진료과를 먼저 쓰고, 없으면 정확히 같은 이름의 등록 고객 정보만 본다.
// 둘 다 없을 때 general 같은 기본값을 넣지 않는다. 어떤 분류 기준을 쓸지 정해지지 않았다는
// 사실을 드러내고 멈춘다. 촬영 방식은 폴더 전체 값이 아니라 사진별 AI가 판정한다.
async function departmentFromFolderOrRegisteredClient(
  db: ReturnType<typeof getSupabaseAdmin>,
  folderName: string,
): Promise<MedicalDepartment | null> {
  const fromFolder = departmentFromPhotoText(folderName);
  if (fromFolder) return fromFolder;
  // 날짜 접두어만 제거한 정확한 고객명으로만 보완한다. 화면에 남아 있는 다른 고객을
  // 사진 폴더 대상으로 대체하지 않는다.
  const clientName = folderName.replace(/^\d{2,8}[\s._-]*/, "").trim();
  if (clientName) {
    try {
      const { data, error } = await db
        .from("clients")
        .select("specialty,department")
        .eq("hospital_name", clientName)
        .maybeSingle();
      const fromClient = !error && data
        ? departmentFromPhotoText(String(data.specialty || data.department || ""))
        : null;
      if (fromClient) return fromClient;
    } catch {
      // 조회 실패는 진료과를 알았다는 근거가 아니다.
    }
  }
  return null;
}

/** Worker가 명시적으로 AI 키 없음이라고 보고한 경우에는 분류 job 자체를 만들지 않는다. */
async function assertPhotoAiAvailable(db: ReturnType<typeof getSupabaseAdmin>): Promise<void> {
  if (!await isPhotoAutomationAvailable(db)) {
    throw new OliviaToolError(
      "자동 기능이 꺼져 있습니다. 수동으로 직접하시겠습니까?",
      "PHOTO_AI_UNAVAILABLE",
    );
  }
}

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
    rememberFolderCandidates(dataSource, candidates);
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
    const candidate = await resolvePhotoFolderForStart(folderName, dataSource);
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
            ? `"${candidate.displayName}"은(는) 이미 JPG정리가 완료되어 있어요.`
            : `JPG정리를 시작했습니다. RAW는 원래 자리에 그대로 둡니다.`,
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

    // 방금 find에서 검증한 정확한 후보를 재사용하고, 없으면 live NAS 후보를 다시 확인한다.
    // 부분 이름이 여러 폴더에 걸리면 프로젝트 행과 job을 만들지 않는다. NFD raw path는
    // candidate.sourceRelativePath를 그대로 사용한다.
    const candidate = await resolvePhotoFolderForStart(folderName, dataSource);
    const db = getSupabaseAdmin();
    const existing = await readProjectByPath(db, candidate.sourceRelativePath);
    const only = input.only === "연출" || input.only === "프로필" || input.only === "인테리어" ? input.only : "all";
    const department = await departmentFromFolderOrRegisteredClient(db, candidate.displayName);
    if (!department) {
      throw new PhotoPipelineStartError(
        "로직에 없어서 임의로 정하지 않았어요 — 진료과를 알려주세요.",
        "PHOTO_DEPARTMENT_REQUIRED",
        { folderName: candidate.displayName },
      );
    }
    await assertPhotoAiAvailable(db);
    let project;
    try {
      project = await startNasBackupClassification(db, {
        folderName: candidate.sourceRelativePath,
        department,
        only,
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
        only,
        status: project.status,
        createdProject: !existing,
        summary: project.status === "CLASSIFY_COMPLETED"
          ? `"${candidate.displayName}"은(는) 이미 분류가 완료되어 있어요.`
          : only === "all" ? "JPG정리와 전체 분류를 시작했습니다. 진행 중입니다." : `${only}정리를 시작했습니다. 진행 중입니다.`,
      },
      verification: createVerification({ executed: true, persisted: true, resourceExists: true, details: { projectId: project.id } }),
    };
  }

  throw new Error("지원하지 않는 Olivia 작업이에요.");
}
