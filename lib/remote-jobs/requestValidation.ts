const REMOTE_JOB_ACTIONS = [
  "PING",
  "PHOTO_SORT",
  "PHOTO_THUMBS",
  "PHOTO_XMP_RATINGS",
  "PHOTO_CHECK_WORK_FOLDER",
  "COPY_TEST",
  "LIST_FOLDER",
  "PHOTO_PREPARE_SOURCE",
  "PHOTO_STAGE_JPG",
  "PHOTO_CLASSIFY_WORK",
  "PHOTO_RAW_MATCH",
  "PHOTO_RAW_MATCH_COPY",
  "PHOTO_RESIZE",
  "PHOTO_AI_SELECT",
  "PHOTO_RETOUCH",
  "PERSON_SELECT_IMPORT",
  "PERSON_SELECT_DELIVERY_IMPORT",
  "PERSON_SELECT_DELIVERY_PURGE",
  "PERSON_SELECT_RAW_MATCH",
  "PERSON_SELECT_LIST_FOLDER",
  "VIDEO_INTERVIEW_ANALYZE",
  "VIDEO_AUDIO_EXTRACT",
] as const;

export type RemoteJobAction = (typeof REMOTE_JOB_ACTIONS)[number];

const REMOTE_JOB_ACTION_SET = new Set<string>(REMOTE_JOB_ACTIONS);
const NON_PRIMARY_WORKER_ACTIONS = new Set<RemoteJobAction>([
  "VIDEO_INTERVIEW_ANALYZE",
  "VIDEO_AUDIO_EXTRACT",
  "LIST_FOLDER",
  "PING",
]);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function normalizeRemoteJobAction(value: unknown): RemoteJobAction | null {
  const action = typeof value === "string" ? value.trim().toUpperCase() : "";
  return REMOTE_JOB_ACTION_SET.has(action) ? action as RemoteJobAction : null;
}

export function canRunOnNonPrimaryWorker(action: RemoteJobAction): boolean {
  return NON_PRIMARY_WORKER_ACTIONS.has(action);
}

export function isRemoteJobUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

export function safeProjectSubpath(value: unknown, fallback: string): string {
  const candidate = value === undefined ? fallback : value;
  if (
    typeof candidate !== "string"
    || !candidate.trim()
    || candidate.includes("\0")
    || candidate.includes("\\")
    || candidate.startsWith("/")
  ) {
    throw new Error("프로젝트 내부 경로는 안전한 상대경로여야 합니다.");
  }
  const segments = candidate.split("/");
  if (segments.some((segment) => !segment || segment === "." || segment === "..")) {
    throw new Error("프로젝트 내부 경로가 올바르지 않습니다.");
  }
  return segments.join("/");
}

export function safeFileNames(
  value: unknown,
  options: { required: boolean; max: number },
): string[] | undefined {
  if (value === undefined && !options.required) return undefined;
  if (!Array.isArray(value) || value.length === 0 || value.length > options.max) {
    throw new Error(`파일명은 1~${options.max}개 문자열 배열이어야 합니다.`);
  }
  return value.map((entry) => {
    if (
      typeof entry !== "string"
      || !entry.trim()
      || entry.includes("\0")
      || entry.includes("/")
      || entry.includes("\\")
    ) {
      throw new Error("파일명에 경로를 포함할 수 없습니다.");
    }
    return entry.trim();
  });
}

export function finiteNumber(
  value: unknown,
  label: string,
  min: number,
  max: number,
  integer = false,
): number | undefined {
  if (value === undefined) return undefined;
  if (
    typeof value !== "number"
    || !Number.isFinite(value)
    || value < min
    || value > max
    || (integer && !Number.isInteger(value))
  ) {
    throw new Error(`${label} 값이 올바르지 않습니다.`);
  }
  return value;
}

export function safeWorkerAbsolutePath(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim() || !value.startsWith("/") || value.includes("\0")) {
    throw new Error(`${label}은 Mac Studio의 안전한 절대경로여야 합니다.`);
  }
  const segments = value.split("/");
  if (segments.some((segment) => segment === "..")) {
    throw new Error(`${label}에 상위 경로를 포함할 수 없습니다.`);
  }
  return value.trim().replace(/\/+$/u, "");
}

export function safeWorkerRelativePath(value: unknown, label: string): string {
  if (
    typeof value !== "string"
    || !value.trim()
    || value.startsWith("/")
    || value.includes("\0")
    || value.includes("\\")
  ) {
    throw new Error(`${label}은 안전한 상대경로여야 합니다.`);
  }
  const segments = value.split("/");
  if (segments.some((segment) => !segment || segment === "." || segment === "..")) {
    throw new Error(`${label}이 올바르지 않습니다.`);
  }
  return segments.join("/");
}

export function safeLogText(value: unknown, label: string, max = 2_000): string {
  if (typeof value !== "string" || value.length > max || value.includes("\0")) {
    throw new Error(`${label} 값이 올바르지 않습니다.`);
  }
  return value;
}

/** 개인별 사진 셀렉은 전용 Worker에서만 실제 허용 루트를 realpath로 검증한다. */
export function safePersonSelectSourcePath(value: unknown): string {
  if (typeof value !== "string" || !value.trim() || value.includes("\0")) {
    throw new Error("학교전달 폴더를 선택해 주세요.");
  }
  const path = value.trim();
  if (path.split(/[\\/]/).some((segment) => segment === "..")) {
    throw new Error("허용 루트 밖의 경로는 사용할 수 없습니다.");
  }
  return path;
}
