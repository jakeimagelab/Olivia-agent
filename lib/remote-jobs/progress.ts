export const REMOTE_JOB_PROGRESS_STAGES = [
  "STAGING",
  "SCANNING",
  "ANALYZING",
  "ORGANIZING",
  "VERIFYING",
] as const;

export type RemoteJobProgressStage = typeof REMOTE_JOB_PROGRESS_STAGES[number];

export type RemoteJobProgress = {
  stage: RemoteJobProgressStage;
  current?: number;
  total?: number;
  message: string;
};

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function optionalCount(value: unknown, name: string): number | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new Error(`${name}은 0 이상의 정수여야 합니다.`);
  }
  return value;
}

export function parseRemoteJobProgress(value: unknown): RemoteJobProgress | null {
  if (!isRecord(value) || Object.keys(value).length === 0) return null;

  const stage = typeof value.stage === "string" ? value.stage.toUpperCase() : "";
  if (!REMOTE_JOB_PROGRESS_STAGES.includes(stage as RemoteJobProgressStage)) {
    throw new Error("지원하지 않는 원격 작업 진행 단계입니다.");
  }

  const message = typeof value.message === "string" ? value.message.trim() : "";
  if (!message || message.length > 500) {
    throw new Error("진행 메시지는 1~500자여야 합니다.");
  }

  const current = optionalCount(value.current, "current");
  const total = optionalCount(value.total, "total");
  if (current !== undefined && total !== undefined && current > total) {
    throw new Error("current는 total보다 클 수 없습니다.");
  }

  return {
    stage: stage as RemoteJobProgressStage,
    ...(current === undefined ? {} : { current }),
    ...(total === undefined ? {} : { total }),
    message,
  };
}
