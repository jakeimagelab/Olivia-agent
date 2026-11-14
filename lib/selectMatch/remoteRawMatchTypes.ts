export type RemoteRawMatchLogResult = "확정" | "수동선택" | "건너뜀";

export type RemoteRawMatchCopyItem = {
  rawPath: string;
  destDir: string;
  rawAction?: "copy" | "move";
  rawExpectedSize: number;
  rawExpectedCaptureTimeMs: number | null;
  jpgPath?: string;
  jpgDestDir?: string;
  jpgExpectedSize?: number;
  jpgExpectedCaptureTimeMs?: number | null;
};

export type RemoteRawMatchLogRow = {
  jpgName: string;
  jpgPath: string;
  jpgCaptureTime: string;
  rawPath: string;
  rawCaptureTime: string;
  result: RemoteRawMatchLogResult;
};

export type RemoteRawMatchCopyPayload = {
  rawRootPath: string;
  jpgRootPath?: string;
  items: RemoteRawMatchCopyItem[];
  logRows: RemoteRawMatchLogRow[];
  openOutput?: boolean;
};

export type RemoteRawMatchCopyFailure = {
  stage: "raw_copy" | "jpg_move" | "xmp_move";
  path: string;
  error: string;
};

export type RemoteRawMatchCopyWarning = {
  stage: "raw_copy" | "jpg_move" | "xmp_move";
  path: string;
  warning: string;
};

export type RemoteRawMatchCopyResult = {
  ok: true;
  status: "PHOTO_RAW_MATCH_COPY_COMPLETED";
  outputDir: string;
  copied: number;
  alreadyCopied: number;
  rawMoved: number;
  jpgMoved: number;
  xmpMoved: number;
  failed: number;
  failures: RemoteRawMatchCopyFailure[];
  warnings: RemoteRawMatchCopyWarning[];
  attributePassed: number;
  attributeFailed: number;
  logPath: string;
};

export type RemoteRawMatchJob = {
  id: string;
  status: "QUEUED" | "RUNNING" | "COMPLETED" | "FAILED" | "CANCELED";
  result: RemoteRawMatchCopyResult | null;
  message: string | null;
  error: string | null;
  progress: { current: number; total: number; message: string } | null;
};

export type RunRemoteRawMatchOptions = {
  workerOnline: boolean | null;
  fetcher?: typeof fetch;
  signal?: AbortSignal;
  pollIntervalMs?: number;
  timeoutMs?: number;
  onJob?: (job: RemoteRawMatchJob) => void;
};
