import { validatePhotoProjectRelativePath } from "@/lib/photo-storage/server";
import {
  finiteNumber,
  isRemoteJobUuid,
  safeFileNames,
  safeProjectSubpath,
  type RemoteJobAction,
} from "./requestValidation";

type RemoteJobPayload = Record<string, unknown>;

function requireProjectId(action: RemoteJobAction, value: unknown): string {
  if (!isRemoteJobUuid(value)) throw new Error(`${action}에는 올바른 project_id가 필요합니다.`);
  return value;
}

function normalizePrepareSource(requested: RemoteJobPayload): RemoteJobPayload {
  return {
    project_id: requireProjectId("PHOTO_PREPARE_SOURCE", requested.project_id),
    source_relative_path: validatePhotoProjectRelativePath(requested.source_relative_path),
  };
}

function normalizeStageJpg(requested: RemoteJobPayload): RemoteJobPayload {
  const projectId = requireProjectId("PHOTO_STAGE_JPG", requested.project_id);
  const sourceRelativePath = validatePhotoProjectRelativePath(requested.source_relative_path);
  const destinationRelativePath = validatePhotoProjectRelativePath(requested.destination_relative_path);
  if (destinationRelativePath !== sourceRelativePath) {
    throw new Error("PHOTO_STAGE_JPG는 동일한 프로젝트 경로의 JPG전체로만 복사할 수 있습니다.");
  }
  return {
    project_id: projectId,
    source_relative_path: sourceRelativePath,
    destination_relative_path: destinationRelativePath,
  };
}

function normalizeClassifyWork(requested: RemoteJobPayload): RemoteJobPayload {
  const projectId = requireProjectId("PHOTO_CLASSIFY_WORK", requested.project_id);
  return {
    project_id: projectId,
    work_relative_path: validatePhotoProjectRelativePath(requested.work_relative_path),
    ...(typeof requested.department === "string" ? { department: requested.department } : {}),
    ...(typeof requested.gap_minutes === "number" ? { gap_minutes: requested.gap_minutes } : {}),
    ...(requested.classification_ui_mode === "advanced" || requested.classification_ui_mode === "ai-auto"
      ? { classification_ui_mode: requested.classification_ui_mode }
      : {}),
    ...(typeof requested.fast_analyze_mode === "boolean" ? { fast_analyze_mode: requested.fast_analyze_mode } : {}),
    ...(typeof requested.department_logic_enabled === "boolean"
      ? { department_logic_enabled: requested.department_logic_enabled }
      : {}),
    ...(typeof requested.ai_naming_enabled === "boolean" ? { ai_naming_enabled: requested.ai_naming_enabled } : {}),
    ...(typeof requested.quality_analysis_enabled === "boolean"
      ? { quality_analysis_enabled: requested.quality_analysis_enabled }
      : {}),
    ...(typeof requested.profile_classification_enabled === "boolean"
      ? { profile_classification_enabled: requested.profile_classification_enabled }
      : {}),
  };
}

function normalizeRawMatch(requested: RemoteJobPayload): RemoteJobPayload {
  const selectedFileNames = safeFileNames(requested.selected_file_names, { required: false, max: 10_000 });
  return {
    project_id: requireProjectId("PHOTO_RAW_MATCH", requested.project_id),
    project_relative_path: validatePhotoProjectRelativePath(requested.project_relative_path),
    ...(selectedFileNames ? { selected_file_names: selectedFileNames } : {}),
    ...(isRemoteJobUuid(requested.selection_id) ? { selection_id: requested.selection_id } : {}),
  };
}

function normalizeResize(requested: RemoteJobPayload): RemoteJobPayload {
  const longEdge = finiteNumber(requested.long_edge, "long_edge", 500, 10_000, true);
  const quality = finiteNumber(requested.quality, "quality", 1, 100, true);
  return {
    project_id: requireProjectId("PHOTO_RESIZE", requested.project_id),
    project_relative_path: validatePhotoProjectRelativePath(requested.project_relative_path),
    input_relative_path: safeProjectSubpath(requested.input_relative_path, "씬별분류"),
    ...(longEdge === undefined ? {} : { long_edge: requested.long_edge }),
    ...(quality === undefined ? {} : { quality: requested.quality }),
  };
}

function normalizeAiSelect(requested: RemoteJobPayload): RemoteJobPayload {
  const booleanKeys = ["quality_filter", "dup_removal"] as const;
  for (const key of booleanKeys) {
    if (requested[key] !== undefined && typeof requested[key] !== "boolean") {
      throw new Error(`${key}는 boolean이어야 합니다.`);
    }
  }
  return {
    project_id: requireProjectId("PHOTO_AI_SELECT", requested.project_id),
    project_relative_path: validatePhotoProjectRelativePath(requested.project_relative_path),
    input_relative_path: safeProjectSubpath(requested.input_relative_path, "씬별분류"),
    ...Object.fromEntries(
      booleanKeys.filter((key) => requested[key] !== undefined).map((key) => [key, requested[key]]),
    ),
    ...(finiteNumber(requested.blur_threshold, "blur_threshold", 0, 10_000) === undefined
      ? {}
      : { blur_threshold: requested.blur_threshold }),
    ...(finiteNumber(requested.dark_threshold, "dark_threshold", 0, 255) === undefined
      ? {}
      : { dark_threshold: requested.dark_threshold }),
    ...(finiteNumber(requested.overexp_threshold, "overexp_threshold", 0, 255) === undefined
      ? {}
      : { overexp_threshold: requested.overexp_threshold }),
    ...(finiteNumber(requested.dup_threshold, "dup_threshold", 0, 100) === undefined
      ? {}
      : { dup_threshold: requested.dup_threshold }),
  };
}

function normalizeRetouch(requested: RemoteJobPayload): RemoteJobPayload {
  return {
    project_id: requireProjectId("PHOTO_RETOUCH", requested.project_id),
    project_relative_path: validatePhotoProjectRelativePath(requested.project_relative_path),
    file_names: safeFileNames(requested.file_names, { required: true, max: 10 }),
    check_type: requested.check_type === "gown" ? "gown" : "skin",
  };
}

/** Returns null for actions outside the project-based photo operation pipeline. */
export function normalizePhotoOperationRequestPayload(
  action: RemoteJobAction,
  requested: RemoteJobPayload,
): RemoteJobPayload | null {
  switch (action) {
    case "PHOTO_PREPARE_SOURCE":
      return normalizePrepareSource(requested);
    case "PHOTO_STAGE_JPG":
      return normalizeStageJpg(requested);
    case "PHOTO_CLASSIFY_WORK":
      return normalizeClassifyWork(requested);
    case "PHOTO_RAW_MATCH":
      return normalizeRawMatch(requested);
    case "PHOTO_RESIZE":
      return normalizeResize(requested);
    case "PHOTO_AI_SELECT":
      return normalizeAiSelect(requested);
    case "PHOTO_RETOUCH":
      return normalizeRetouch(requested);
    default:
      return null;
  }
}
