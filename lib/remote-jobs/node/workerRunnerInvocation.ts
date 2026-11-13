import path from "node:path";
import {
  workerBooleanValue,
  workerNumberValue,
  workerStringArrayValue,
  workerStringValue,
  type WorkerJsonRecord,
} from "../workerPayload";

type WorkerJob = {
  action: string;
  payload: WorkerJsonRecord;
};

export type RunnerInvocation = {
  command: string;
  args: string[];
  cwd: string;
  killProcessGroup?: boolean;
};

function isRecord(value: unknown): value is WorkerJsonRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function addString(args: string[], flag: string, value: string | undefined): void {
  if (value !== undefined) args.push(flag, value);
}

function addNumber(args: string[], flag: string, value: number | undefined): void {
  if (value !== undefined) args.push(flag, String(value));
}

function addBoolean(args: string[], flag: string, value: boolean | undefined): void {
  if (value !== undefined) args.push(flag, String(value));
}

function runner(repoRoot: string, scriptName: string, args: string[]): RunnerInvocation {
  return {
    command: process.execPath,
    args: ["--import", "tsx", path.join(repoRoot, "scripts", scriptName), ...args],
    cwd: repoRoot,
  };
}

function videoRunner(repoRoot: string, args: string[]): RunnerInvocation {
  const invocation = runner(repoRoot, "video-interview-runner.ts", args);
  if (process.platform !== "darwin") return { ...invocation, killProcessGroup: true };
  return {
    command: "/usr/bin/caffeinate",
    args: ["-i", invocation.command, ...invocation.args],
    cwd: invocation.cwd,
    killProcessGroup: true,
  };
}

/** 서버 job payload를 검증된 기존 runner CLI 인자로만 변환한다. */
export function createRunnerInvocation(job: WorkerJob, repoRoot: string): RunnerInvocation | null {
  const payload = job.payload;
  const args: string[] = [];

  switch (job.action) {
    case "PHOTO_SORT": {
      const sourceFolder = workerStringValue(payload, "source_folder");
      if (!sourceFolder) throw new Error("PHOTO_SORT에는 source_folder가 필요합니다.");
      addString(args, "--source-folder", sourceFolder);
      addString(args, "--department", workerStringValue(payload, "department"));
      addNumber(args, "--gap-minutes", workerNumberValue(payload, "gap_minutes"));
      addString(args, "--classification-ui-mode", workerStringValue(payload, "classification_ui_mode"));
      addBoolean(args, "--fast-analyze-mode", workerBooleanValue(payload, "fast_analyze_mode"));
      addBoolean(args, "--department-logic-enabled", workerBooleanValue(payload, "department_logic_enabled"));
      addBoolean(args, "--ai-naming-enabled", workerBooleanValue(payload, "ai_naming_enabled"));
      addBoolean(args, "--quality-analysis-enabled", workerBooleanValue(payload, "quality_analysis_enabled"));
      addBoolean(args, "--profile-classification-enabled", workerBooleanValue(payload, "profile_classification_enabled"));
      return runner(repoRoot, "remote-photo-sort-runner.ts", args);
    }
    case "PHOTO_THUMBS":
      addString(args, "--remote-path", workerStringValue(payload, "remote_path", true));
      addNumber(args, "--max-count", workerNumberValue(payload, "max_count"));
      addNumber(args, "--offset", workerNumberValue(payload, "offset"));
      return runner(repoRoot, "photo-thumbs-runner.ts", args);
    case "PHOTO_XMP_RATINGS":
      addString(args, "--remote-path", workerStringValue(payload, "remote_path", true));
      return runner(repoRoot, "photo-xmp-ratings-runner.ts", args);
    case "PHOTO_PREPARE_SOURCE":
      addString(args, "--source-relative-path", workerStringValue(payload, "source_relative_path", true));
      return runner(repoRoot, "photo-prepare-source-runner.ts", args);
    case "PHOTO_STAGE_JPG":
      addString(args, "--source-relative-path", workerStringValue(payload, "source_relative_path", true));
      addString(args, "--destination-relative-path", workerStringValue(payload, "destination_relative_path"));
      return runner(repoRoot, "photo-stage-jpg-runner.ts", args);
    case "PHOTO_CLASSIFY_WORK":
      addString(args, "--work-relative-path", workerStringValue(payload, "work_relative_path", true));
      addString(args, "--only", workerStringValue(payload, "only"));
      addString(args, "--department", workerStringValue(payload, "department"));
      addNumber(args, "--gap-minutes", workerNumberValue(payload, "gap_minutes"));
      addString(args, "--classification-ui-mode", workerStringValue(payload, "classification_ui_mode"));
      addBoolean(args, "--fast-analyze-mode", workerBooleanValue(payload, "fast_analyze_mode"));
      addBoolean(args, "--department-logic-enabled", workerBooleanValue(payload, "department_logic_enabled"));
      addBoolean(args, "--ai-naming-enabled", workerBooleanValue(payload, "ai_naming_enabled"));
      addBoolean(args, "--quality-analysis-enabled", workerBooleanValue(payload, "quality_analysis_enabled"));
      addBoolean(args, "--profile-classification-enabled", workerBooleanValue(payload, "profile_classification_enabled"));
      addNumber(args, "--expected-jpg-count", workerNumberValue(payload, "expected_jpg_count"));
      addNumber(args, "--expected-jpg-bytes", workerNumberValue(payload, "expected_jpg_bytes"));
      return runner(repoRoot, "photo-classify-work-runner.ts", args);
    case "PHOTO_RAW_MATCH": {
      addString(args, "--project-relative-path", workerStringValue(payload, "project_relative_path", true));
      const selected = workerStringArrayValue(payload, "selected_file_names");
      if (selected) addString(args, "--selected-file-names-json", JSON.stringify(selected));
      return runner(repoRoot, "photo-raw-match-runner.ts", args);
    }
    case "PHOTO_RESIZE":
      addString(args, "--project-relative-path", workerStringValue(payload, "project_relative_path", true));
      addString(args, "--input-relative-path", workerStringValue(payload, "input_relative_path"));
      addNumber(args, "--long-edge", workerNumberValue(payload, "long_edge"));
      addNumber(args, "--quality", workerNumberValue(payload, "quality"));
      return runner(repoRoot, "photo-resize-runner.ts", args);
    case "PHOTO_AI_SELECT":
      addString(args, "--project-relative-path", workerStringValue(payload, "project_relative_path", true));
      addString(args, "--input-relative-path", workerStringValue(payload, "input_relative_path"));
      addBoolean(args, "--quality-filter", workerBooleanValue(payload, "quality_filter"));
      addNumber(args, "--blur-threshold", workerNumberValue(payload, "blur_threshold"));
      addNumber(args, "--dark-threshold", workerNumberValue(payload, "dark_threshold"));
      addNumber(args, "--overexp-threshold", workerNumberValue(payload, "overexp_threshold"));
      addBoolean(args, "--dup-removal", workerBooleanValue(payload, "dup_removal"));
      addNumber(args, "--dup-threshold", workerNumberValue(payload, "dup_threshold"));
      return runner(repoRoot, "photo-ai-select-runner.ts", args);
    case "PHOTO_RETOUCH": {
      addString(args, "--project-relative-path", workerStringValue(payload, "project_relative_path", true));
      const files = workerStringArrayValue(payload, "file_names");
      if (!files?.length) throw new Error("PHOTO_RETOUCH에는 file_names가 필요합니다.");
      addString(args, "--file-names-json", JSON.stringify(files));
      addString(args, "--check-type", workerStringValue(payload, "check_type"));
      return runner(repoRoot, "photo-retouch-runner.ts", args);
    }
    case "PERSON_SELECT_IMPORT":
      addString(args, "--event-id", workerStringValue(payload, "event_id", true));
      addString(args, "--source-relative-path", workerStringValue(payload, "source_relative_path", true));
      if (payload.layout === "person-folders" || payload.layout === "project") {
        addString(args, "--layout", payload.layout);
      } else {
        if (!Array.isArray(payload.mappings) || payload.mappings.length === 0) {
          throw new Error("PERSON_SELECT_IMPORT에는 mappings가 필요합니다.");
        }
        addString(args, "--mappings-json", JSON.stringify(payload.mappings));
      }
      return runner(repoRoot, "person-select-import.ts", args);
    case "PERSON_SELECT_DELIVERY_IMPORT":
      addString(args, "--event-id", workerStringValue(payload, "event_id", true));
      addString(args, "--source-relative-path", workerStringValue(payload, "source_relative_path", true));
      return runner(repoRoot, "person-select-delivery-import.ts", args);
    case "PERSON_SELECT_DELIVERY_PURGE":
      return runner(repoRoot, "person-select-delivery-purge.ts", args);
    case "PERSON_SELECT_RAW_MATCH":
      addString(args, "--event-id", workerStringValue(payload, "event_id", true));
      addString(args, "--mode", workerStringValue(payload, "mode") || "copy");
      addString(args, "--source", workerStringValue(payload, "source") || "submitted");
      if (payload.clear_mark === true) args.push("--clear-mark");
      if (isRecord(payload.labelNames)) addString(args, "--label-names-json", JSON.stringify(payload.labelNames));
      if (Array.isArray(payload.reviewerIds) && payload.reviewerIds.length) {
        addString(args, "--reviewer-ids-json", JSON.stringify(payload.reviewerIds));
      }
      return runner(repoRoot, "person-select-raw-match.ts", args);
    case "PERSON_SELECT_QUALITY":
      addString(args, "--job-id", workerStringValue(payload, "quality_job_id", true));
      return runner(repoRoot, "person-select-quality.ts", args);
    case "PERSON_SELECT_DOWNLOAD":
      addString(args, "--job-id", workerStringValue(payload, "download_job_id", true));
      return runner(repoRoot, "person-select-download.ts", args);
    case "VIDEO_INTERVIEW_ANALYZE":
      addString(args, "--action", "analyze");
      addString(args, "--source-relative-path", workerStringValue(payload, "source_relative_path", true));
      addString(args, "--context", workerStringValue(payload, "context"));
      return videoRunner(repoRoot, args);
    case "VIDEO_AUDIO_EXTRACT":
      addString(args, "--action", "extract-audio");
      addString(args, "--source-relative-path", workerStringValue(payload, "source_relative_path", true));
      return videoRunner(repoRoot, args);
    case "PING":
    case "COPY_TEST":
    case "LIST_FOLDER":
    case "PERSON_SELECT_LIST_FOLDER":
    case "PHOTO_CHECK_WORK_FOLDER":
    case "PHOTO_RAW_MATCH_COPY":
      return null;
    default:
      throw new Error(`지원하지 않는 Worker action입니다: ${job.action}`);
  }
}
