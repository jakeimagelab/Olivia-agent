import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { isAdminSession } from "@/lib/passkey";
import { normalizeRemoteNasRelativePath } from "@/lib/remote-nas/path";
import { validatePhotoProjectRelativePath } from "@/lib/photo-storage/server";
import { getConfiguredWorkerId, isKnownWorkerId } from "@/lib/remoteWorkerAuth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ALLOWED_ACTIONS = new Set([
  "PING",
  "PHOTO_SORT",
  "PHOTO_CHECK_WORK_FOLDER",
  "COPY_TEST",
  "LIST_FOLDER",
  "PHOTO_PREPARE_SOURCE",
  "PHOTO_STAGE_JPG",
  "PHOTO_CLASSIFY_WORK",
  "PHOTO_RAW_MATCH",
  "PHOTO_RESIZE",
  "PHOTO_AI_SELECT",
  "PHOTO_RETOUCH",
  "VIDEO_INTERVIEW_ANALYZE",
  "VIDEO_AUDIO_EXTRACT",
]);
const NON_PRIMARY_WORKER_ACTIONS = new Set([
  "VIDEO_INTERVIEW_ANALYZE",
  "VIDEO_AUDIO_EXTRACT",
  "LIST_FOLDER",
  "PING",
]);

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isInternalRequest(request: NextRequest): boolean {
  const expected = process.env.INTERNAL_API_KEY;
  if (!expected) return false;

  return request.headers.get("x-internal-key") === expected;
}

function isAuthorized(request: NextRequest): boolean {
  return isAdminSession(request) || isInternalRequest(request);
}

function safeProjectSubpath(value: unknown, fallback: string): string {
  const candidate = value === undefined ? fallback : value;
  if (typeof candidate !== "string" || !candidate.trim() || candidate.includes("\0") || candidate.includes("\\") || candidate.startsWith("/")) {
    throw new Error("프로젝트 내부 경로는 안전한 상대경로여야 합니다.");
  }
  const segments = candidate.split("/");
  if (segments.some((segment) => !segment || segment === "." || segment === "..")) throw new Error("프로젝트 내부 경로가 올바르지 않습니다.");
  return segments.join("/");
}

function safeFileNames(value: unknown, options: { required: boolean; max: number }): string[] | undefined {
  if (value === undefined && !options.required) return undefined;
  if (!Array.isArray(value) || value.length === 0 || value.length > options.max) throw new Error(`파일명은 1~${options.max}개 문자열 배열이어야 합니다.`);
  return value.map((entry) => {
    if (typeof entry !== "string" || !entry.trim() || entry.includes("\0") || entry.includes("/") || entry.includes("\\")) throw new Error("파일명에 경로를 포함할 수 없습니다.");
    return entry.trim();
  });
}

function finiteNumber(value: unknown, label: string, min: number, max: number, integer = false): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max || (integer && !Number.isInteger(value))) throw new Error(`${label} 값이 올바르지 않습니다.`);
  return value;
}

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return Response.json(
      { ok: false, error: "관리자 로그인이 필요합니다." },
      { status: 401 }
    );
  }

  const body = await request.json().catch(() => ({}));

  const action =
    typeof body.action === "string"
      ? body.action.trim().toUpperCase()
      : "";

  if (!ALLOWED_ACTIONS.has(action)) {
    return Response.json(
      { ok: false, error: "지원하지 않는 작업입니다." },
      { status: 400 }
    );
  }

  const requestedPayload =
    body.payload &&
    typeof body.payload === "object" &&
    !Array.isArray(body.payload)
      ? body.payload
      : {};

  let payload: Record<string, unknown> = requestedPayload;

  if (action === "LIST_FOLDER") {
    const remotePath = requestedPayload.remote_path;
    const root = requestedPayload.root;
    const foldersOnly = requestedPayload.folders_only;

    if (remotePath !== undefined && remotePath !== null && typeof remotePath !== "string") {
      return Response.json(
        { ok: false, error: "LIST_FOLDER의 remote_path는 문자열이어야 합니다." },
        { status: 400 }
      );
    }

    if (foldersOnly !== undefined && typeof foldersOnly !== "boolean") {
      return Response.json(
        { ok: false, error: "folders_only는 boolean이어야 합니다." },
        { status: 400 }
      );
    }

    if (root !== undefined && typeof root !== "boolean") {
      return Response.json(
        { ok: false, error: "LIST_FOLDER의 root는 boolean이어야 합니다." },
        { status: 400 }
      );
    }

    try {
      // 경로의 Unicode form은 Worker가 반환한 그대로 유지한다. 절대경로와
      // traversal만 차단한다. 빈 값/누락은 NAS Root를 뜻하며 LIST_FOLDER에
      // 불필요한 payload 필드는 전달하지 않는다.
      const normalizedPath = normalizeRemoteNasRelativePath(remotePath ?? "");
      if (root === true && normalizedPath) {
        return Response.json(
          { ok: false, error: "LIST_FOLDER의 root와 remote_path를 동시에 지정할 수 없습니다." },
          { status: 400 }
        );
      }
      payload = {
        ...(root === true || !normalizedPath ? { root: true } : { remote_path: normalizedPath }),
        ...(foldersOnly === true ? { folders_only: true } : {}),
      };
    } catch (error) {
      return Response.json(
        {
          ok: false,
          error: error instanceof Error ? error.message : "올바르지 않은 NAS 경로입니다.",
        },
        { status: 400 }
      );
    }
  }

  if (action === "PHOTO_SORT" || action === "PHOTO_CHECK_WORK_FOLDER") {
    const sourceFolder = requestedPayload.source_folder;

    if (typeof sourceFolder !== "string") {
      return Response.json(
        { ok: false, error: `${action}에는 source_folder 상대경로가 필요합니다.` },
        { status: 400 }
      );
    }

    try {
      const safeSourceFolder = normalizeRemoteNasRelativePath(sourceFolder);
      if (!safeSourceFolder) {
        return Response.json(
          { ok: false, error: "NAS Root가 아닌 촬영 폴더를 선택해주세요." },
          { status: 400 }
        );
      }

      // Worker가 반환한 NFD 상대경로는 그대로 유지한다. 브라우저에서 절대경로를
      // 보내거나 NAS Root 밖으로 이동하는 path segment만 차단한다.
      payload = action === "PHOTO_SORT"
        ? { ...requestedPayload, source_folder: safeSourceFolder }
        : { source_folder: safeSourceFolder };
    } catch (error) {
      return Response.json(
        {
          ok: false,
          error: error instanceof Error ? error.message : "올바르지 않은 NAS 작업 경로입니다.",
        },
        { status: 400 }
      );
    }
  }

  if (action === "PHOTO_PREPARE_SOURCE") {
    const projectId = requestedPayload.project_id;
    const sourceRelativePath = requestedPayload.source_relative_path;
    if (typeof projectId !== "string" || !UUID_PATTERN.test(projectId)) {
      return Response.json({ ok: false, error: "PHOTO_PREPARE_SOURCE에는 올바른 project_id가 필요합니다." }, { status: 400 });
    }
    try {
      const safeSourcePath = validatePhotoProjectRelativePath(sourceRelativePath);
      payload = {
        project_id: projectId,
        source_relative_path: safeSourcePath,
      };
    } catch (error) {
      return Response.json({ ok: false, error: error instanceof Error ? error.message : "올바르지 않은 통합 경로입니다." }, { status: 400 });
    }
  }

  if (action === "PHOTO_STAGE_JPG") {
    const projectId = requestedPayload.project_id;
    const sourceRelativePath = requestedPayload.source_relative_path;
    const destinationRelativePath = requestedPayload.destination_relative_path;
    if (typeof projectId !== "string" || !UUID_PATTERN.test(projectId)) {
      return Response.json({ ok: false, error: "PHOTO_STAGE_JPG에는 올바른 project_id가 필요합니다." }, { status: 400 });
    }
    try {
      const safeSourcePath = validatePhotoProjectRelativePath(sourceRelativePath);
      const safeDestinationPath = validatePhotoProjectRelativePath(destinationRelativePath);
      if (safeDestinationPath !== safeSourcePath) {
        return Response.json({ ok: false, error: "PHOTO_STAGE_JPG는 동일한 프로젝트 경로의 JPG전체로만 복사할 수 있습니다." }, { status: 400 });
      }
      payload = {
        project_id: projectId,
        source_relative_path: safeSourcePath,
        destination_relative_path: safeDestinationPath,
      };
    } catch (error) {
      return Response.json({ ok: false, error: error instanceof Error ? error.message : "올바르지 않은 staging 경로입니다." }, { status: 400 });
    }
  }

  if (action === "PHOTO_CLASSIFY_WORK") {
    const projectId = requestedPayload.project_id;
    const workRelativePath = requestedPayload.work_relative_path;
    if (typeof projectId !== "string" || !UUID_PATTERN.test(projectId)) {
      return Response.json({ ok: false, error: "PHOTO_CLASSIFY_WORK에는 올바른 project_id가 필요합니다." }, { status: 400 });
    }
    try {
      const safeWorkPath = validatePhotoProjectRelativePath(workRelativePath);
      payload = {
        project_id: projectId,
        work_relative_path: safeWorkPath,
        ...(typeof requestedPayload.department === "string" ? { department: requestedPayload.department } : {}),
        ...(typeof requestedPayload.gap_minutes === "number" ? { gap_minutes: requestedPayload.gap_minutes } : {}),
        ...(requestedPayload.classification_ui_mode === "advanced" || requestedPayload.classification_ui_mode === "ai-auto"
          ? { classification_ui_mode: requestedPayload.classification_ui_mode } : {}),
        ...(typeof requestedPayload.fast_analyze_mode === "boolean" ? { fast_analyze_mode: requestedPayload.fast_analyze_mode } : {}),
        ...(typeof requestedPayload.department_logic_enabled === "boolean" ? { department_logic_enabled: requestedPayload.department_logic_enabled } : {}),
        ...(typeof requestedPayload.ai_naming_enabled === "boolean" ? { ai_naming_enabled: requestedPayload.ai_naming_enabled } : {}),
        ...(typeof requestedPayload.quality_analysis_enabled === "boolean" ? { quality_analysis_enabled: requestedPayload.quality_analysis_enabled } : {}),
        ...(typeof requestedPayload.profile_classification_enabled === "boolean" ? { profile_classification_enabled: requestedPayload.profile_classification_enabled } : {}),
      };
    } catch (error) {
      return Response.json({ ok: false, error: error instanceof Error ? error.message : "올바르지 않은 SSD2 작업 경로입니다." }, { status: 400 });
    }
  }

  if (["PHOTO_RAW_MATCH", "PHOTO_RESIZE", "PHOTO_AI_SELECT", "PHOTO_RETOUCH"].includes(action)) {
    const projectId = requestedPayload.project_id;
    const projectRelativePath = requestedPayload.project_relative_path;
    if (typeof projectId !== "string" || !UUID_PATTERN.test(projectId)) {
      return Response.json({ ok: false, error: `${action}에는 올바른 project_id가 필요합니다.` }, { status: 400 });
    }
    try {
      const safeProjectPath = validatePhotoProjectRelativePath(projectRelativePath);
      if (action === "PHOTO_RAW_MATCH") {
        const selectedFileNames = safeFileNames(requestedPayload.selected_file_names, { required: false, max: 10_000 });
        payload = {
          project_id: projectId,
          project_relative_path: safeProjectPath,
          ...(selectedFileNames ? { selected_file_names: selectedFileNames } : {}),
          ...(typeof requestedPayload.selection_id === "string" && UUID_PATTERN.test(requestedPayload.selection_id) ? { selection_id: requestedPayload.selection_id } : {}),
        };
      } else if (action === "PHOTO_RESIZE") {
        payload = {
          project_id: projectId,
          project_relative_path: safeProjectPath,
          input_relative_path: safeProjectSubpath(requestedPayload.input_relative_path, "씬별분류"),
          ...(finiteNumber(requestedPayload.long_edge, "long_edge", 500, 10_000, true) === undefined ? {} : { long_edge: requestedPayload.long_edge }),
          ...(finiteNumber(requestedPayload.quality, "quality", 1, 100, true) === undefined ? {} : { quality: requestedPayload.quality }),
        };
      } else if (action === "PHOTO_AI_SELECT") {
        const booleanKeys = ["quality_filter", "dup_removal"] as const;
        for (const key of booleanKeys) if (requestedPayload[key] !== undefined && typeof requestedPayload[key] !== "boolean") throw new Error(`${key}는 boolean이어야 합니다.`);
        payload = {
          project_id: projectId,
          project_relative_path: safeProjectPath,
          input_relative_path: safeProjectSubpath(requestedPayload.input_relative_path, "씬별분류"),
          ...Object.fromEntries(booleanKeys.filter((key) => requestedPayload[key] !== undefined).map((key) => [key, requestedPayload[key]])),
          ...(finiteNumber(requestedPayload.blur_threshold, "blur_threshold", 0, 10_000) === undefined ? {} : { blur_threshold: requestedPayload.blur_threshold }),
          ...(finiteNumber(requestedPayload.dark_threshold, "dark_threshold", 0, 255) === undefined ? {} : { dark_threshold: requestedPayload.dark_threshold }),
          ...(finiteNumber(requestedPayload.overexp_threshold, "overexp_threshold", 0, 255) === undefined ? {} : { overexp_threshold: requestedPayload.overexp_threshold }),
          ...(finiteNumber(requestedPayload.dup_threshold, "dup_threshold", 0, 100) === undefined ? {} : { dup_threshold: requestedPayload.dup_threshold }),
        };
      } else {
        payload = {
          project_id: projectId,
          project_relative_path: safeProjectPath,
          file_names: safeFileNames(requestedPayload.file_names, { required: true, max: 10 }),
          check_type: requestedPayload.check_type === "gown" ? "gown" : "skin",
        };
      }
    } catch (error) {
      return Response.json({ ok: false, error: error instanceof Error ? error.message : "올바르지 않은 사진 작업 payload입니다." }, { status: 400 });
    }
  }

  if (action === "VIDEO_INTERVIEW_ANALYZE" || action === "VIDEO_AUDIO_EXTRACT") {
    // 영상작업실: 촬영 폴더는 원격 NAS 브라우저(SOURCE_ROOT 기준)에서 고른 상대 경로다.
    try {
      const sourceRelativePath = normalizeRemoteNasRelativePath(
        typeof requestedPayload.source_relative_path === "string" ? requestedPayload.source_relative_path : "",
      );
      if (!sourceRelativePath) throw new Error("촬영 폴더를 선택해 주세요.");
      const context = typeof requestedPayload.context === "string"
        ? requestedPayload.context.replace(/[\u0000-\u001f]/g, " ").replace(/^-+/, "").trim().slice(0, 500)
        : "";
      payload = {
        source_relative_path: sourceRelativePath,
        ...(action === "VIDEO_INTERVIEW_ANALYZE" && context ? { context } : {}),
      };
    } catch (error) {
      return Response.json({ ok: false, error: error instanceof Error ? error.message : "올바르지 않은 촬영 폴더입니다." }, { status: 400 });
    }
  }

  const targetWorker =
    typeof body.target_worker === "string" &&
    body.target_worker.trim()
      ? body.target_worker.trim()
      : getConfiguredWorkerId();
  if (!isKnownWorkerId(targetWorker)) {
    return Response.json({ ok: false, error: "등록되지 않은 Worker입니다." }, { status: 400 });
  }
  if (targetWorker !== getConfiguredWorkerId() && !NON_PRIMARY_WORKER_ACTIONS.has(action)) {
    return Response.json({ ok: false, error: "선택한 Worker에서는 이 작업을 실행할 수 없습니다." }, { status: 400 });
  }

  try {
    const supabase = getSupabaseAdmin();

    const { data, error } = await supabase
      .from("remote_jobs")
      .insert({
        action,
        payload,
        target_worker: targetWorker,
        status: "QUEUED",
      })
      .select(
        "id,action,payload,target_worker,status,created_at"
      )
      .single();

    if (error) throw error;

    return Response.json({
      ok: true,
      job: data,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "작업 생성 실패";

    console.error("[remote-jobs POST]", error);

    return Response.json(
      { ok: false, error: message },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return Response.json(
      { ok: false, error: "관리자 로그인이 필요합니다." },
      { status: 401 }
    );
  }

  try {
    const supabase = getSupabaseAdmin();
    const jobId = request.nextUrl.searchParams.get("id")?.trim() || "";

    if (jobId) {
      if (!UUID_PATTERN.test(jobId)) {
        return Response.json(
          { ok: false, error: "올바르지 않은 작업 ID입니다." },
          { status: 400 }
        );
      }

      const { data, error } = await supabase
        .from("remote_jobs")
        .select(
          "id,action,target_worker,status,result,progress,message,error,cancel_requested_at,created_at,started_at,completed_at"
        )
        .eq("id", jobId)
        .maybeSingle();

      if (error) throw error;

      if (!data) {
        return Response.json(
          { ok: false, error: "작업을 찾을 수 없습니다." },
          { status: 404 }
        );
      }

      return Response.json({
        ok: true,
        job: data,
      });
    }

    const { data, error } = await supabase
      .from("remote_jobs")
      .select(
        "id,action,payload,target_worker,status,progress,message,error,cancel_requested_at,created_at,started_at,completed_at"
      )
      .order("created_at", { ascending: false })
      .limit(30);

    if (error) throw error;

    return Response.json({
      ok: true,
      jobs: data ?? [],
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "작업 조회 실패";

    return Response.json(
      { ok: false, error: message },
      { status: 500 }
    );
  }
}

/**
 * QUEUED 작업은 즉시 취소하고, 이미 RUNNING이면 Worker가 현재 안전 단위를 마친 뒤
 * 중단하도록 취소 요청만 기록한다. 원본 스토리지는 이 API가 직접 만지지 않는다.
 */
export async function DELETE(request: NextRequest) {
  if (!isAuthorized(request)) return Response.json({ ok: false, error: "관리자 로그인이 필요합니다." }, { status: 401 });

  const jobId = request.nextUrl.searchParams.get("id")?.trim() || "";
  if (!UUID_PATTERN.test(jobId)) return Response.json({ ok: false, error: "올바른 작업 ID가 아닙니다." }, { status: 400 });

  try {
    const supabase = getSupabaseAdmin();
    const now = new Date().toISOString();
    const select = "id,action,target_worker,status,result,progress,message,error,cancel_requested_at,created_at,started_at,completed_at";

    const { data: queued, error: queuedError } = await supabase
      .from("remote_jobs")
      .update({ status: "CANCELED", message: "사용자가 작업을 취소했습니다.", completed_at: now, updated_at: now, cancel_requested_at: now })
      .eq("id", jobId)
      .eq("status", "QUEUED")
      .select(select)
      .maybeSingle();
    if (queuedError) throw queuedError;
    if (queued) return Response.json({ ok: true, job: queued });

    const { data: running, error: runningError } = await supabase
      .from("remote_jobs")
      .update({ cancel_requested_at: now, message: "취소 요청됨 — 현재 파일 작업을 안전하게 멈추는 중입니다.", updated_at: now })
      .eq("id", jobId)
      .eq("status", "RUNNING")
      .select(select)
      .maybeSingle();
    if (runningError) throw runningError;
    if (running) return Response.json({ ok: true, job: running });

    const { data: existing, error: existingError } = await supabase
      .from("remote_jobs")
      .select(select)
      .eq("id", jobId)
      .maybeSingle();
    if (existingError) throw existingError;
    if (!existing) return Response.json({ ok: false, error: "작업을 찾을 수 없습니다." }, { status: 404 });
    return Response.json({ ok: false, error: "이미 끝난 작업은 취소할 수 없습니다.", job: existing }, { status: 409 });
  } catch (error) {
    return Response.json({ ok: false, error: error instanceof Error ? error.message : "작업 취소 요청에 실패했습니다." }, { status: 500 });
  }
}
