import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { isAdminSession } from "@/lib/passkey";
import { normalizeRemoteNasRelativePath } from "@/lib/remote-nas/path";
import { validatePhotoProjectRelativePath } from "@/lib/photo-storage/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ALLOWED_ACTIONS = new Set([
  "PING",
  "PHOTO_SORT",
  "COPY_TEST",
  "LIST_FOLDER",
  "PHOTO_STAGE_JPG",
  "PHOTO_CLASSIFY_WORK",
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
    const foldersOnly = requestedPayload.folders_only;

    if (typeof remotePath !== "string") {
      return Response.json(
        { ok: false, error: "LIST_FOLDER에는 remote_path 문자열이 필요합니다." },
        { status: 400 }
      );
    }

    if (foldersOnly !== undefined && typeof foldersOnly !== "boolean") {
      return Response.json(
        { ok: false, error: "folders_only는 boolean이어야 합니다." },
        { status: 400 }
      );
    }

    try {
      // 경로의 Unicode form은 Worker가 반환한 그대로 유지한다. 절대경로와
      // traversal만 차단하고 LIST_FOLDER에 불필요한 payload 필드는 전달하지 않는다.
      payload = {
        remote_path: normalizeRemoteNasRelativePath(remotePath),
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

  if (action === "PHOTO_SORT") {
    const sourceFolder = requestedPayload.source_folder;

    if (typeof sourceFolder !== "string") {
      return Response.json(
        { ok: false, error: "PHOTO_SORT에는 source_folder 상대경로가 필요합니다." },
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
      payload = {
        ...requestedPayload,
        source_folder: safeSourceFolder,
      };
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
        ...(requestedPayload.shooting_mode === "studio" || requestedPayload.shooting_mode === "field"
          ? { shooting_mode: requestedPayload.shooting_mode } : {}),
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

  const targetWorker =
    typeof body.target_worker === "string" &&
    body.target_worker.trim()
      ? body.target_worker.trim()
      : process.env.OLIVIA_WORKER_ID || "jake-macstudio-01";

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
          "id,action,target_worker,status,result,progress,message,error,created_at,started_at,completed_at"
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
        "id,action,target_worker,status,progress,message,error,created_at,started_at,completed_at"
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
