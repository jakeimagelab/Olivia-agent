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

export type RemoteRawMatchRootLocator = {
  projectKey: string;
  folderName: string;
  relativePath?: string;
  kind: "raw" | "jpg";
};

export type RemoteRawMatchCopyPayload = {
  /** 새 RAW 매칭은 절대경로 대신 폴더 식별 정보와 표본을 워커에 전달한다. */
  rawRoot?: RemoteRawMatchRootLocator;
  jpgRoot?: RemoteRawMatchRootLocator;
  /** 파일명 이동 레거시 도구 호환용. RAW 매칭 UI에서는 생성하거나 노출하지 않는다. */
  rawRootPath?: string;
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
