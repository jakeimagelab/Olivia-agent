import {
  joinRemoteNasPath,
  normalizeRemoteNasRelativePath,
  parentRemoteNasPath,
  sortRemoteNasEntries,
  toRemoteNasDisplayName,
  toRemoteNasDisplayPath,
  validateRemoteNasEntryName,
} from "./path";
import {
  REMOTE_NAS_ROOT_NAME,
  type ListRemoteNasFolderOptions,
  type RemoteNasConnectionState,
  type RemoteNasDataSource,
  type RemoteNasEntry,
  type RemoteNasEntryKind,
  type RemoteNasFolderResult,
} from "./types";

export const REMOTE_WORKER_NAS_POLL_INTERVAL_MS = 800;
export const REMOTE_WORKER_NAS_TIMEOUT_MS = 20_000;

const HIDDEN_SYSTEM_ITEMS = new Set(["#recycle", ".ds_store", "@eadir"]);

type JsonRecord = Record<string, unknown>;

type RemoteJobStatus = "QUEUED" | "RUNNING" | "COMPLETED" | "FAILED";

type RemoteJob = {
  id: string;
  action: string;
  status: RemoteJobStatus;
  result?: unknown;
  message?: string | null;
  error?: string | null;
};

type RemoteWorkerNasDataSourceOptions = {
  fetcher?: typeof fetch;
  pollIntervalMs?: number;
  timeoutMs?: number;
};

export class RemoteNasDataSourceError extends Error {
  readonly connection: RemoteNasConnectionState;

  constructor(message: string, connection: RemoteNasConnectionState) {
    super(message);
    this.name = "RemoteNasDataSourceError";
    this.connection = connection;
  }
}

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function createAbortError(): DOMException {
  return new DOMException("요청이 취소되었습니다.", "AbortError");
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw createAbortError();
}

function waitForPolling(delayMs: number, signal?: AbortSignal): Promise<void> {
  throwIfAborted(signal);
  if (delayMs <= 0) return Promise.resolve();

  return new Promise((resolve, reject) => {
    const handleAbort = () => {
      clearTimeout(timer);
      reject(createAbortError());
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", handleAbort);
      resolve();
    }, delayMs);

    signal?.addEventListener("abort", handleAbort, { once: true });
  });
}

async function readJsonResponse(response: Response): Promise<JsonRecord> {
  const data: unknown = await response.json().catch(() => ({}));
  return isRecord(data) ? data : {};
}

function apiErrorMessage(body: JsonRecord, fallback: string): string {
  return typeof body.error === "string" && body.error.trim() ? body.error : fallback;
}

function parseJob(body: JsonRecord): RemoteJob {
  const value = body.job;
  if (!isRecord(value)) throw new Error("Mac Studio 작업 정보를 읽지 못했습니다.");

  const status = typeof value.status === "string" ? value.status.toUpperCase() : "";
  if (!["QUEUED", "RUNNING", "COMPLETED", "FAILED"].includes(status)) {
    throw new Error("Mac Studio 작업 상태를 읽지 못했습니다.");
  }

  if (typeof value.id !== "string" || !value.id) {
    throw new Error("Mac Studio 작업 ID를 읽지 못했습니다.");
  }

  return {
    id: value.id,
    action: typeof value.action === "string" ? value.action : "",
    status: status as RemoteJobStatus,
    result: value.result,
    message: typeof value.message === "string" ? value.message : null,
    error: typeof value.error === "string" ? value.error : null,
  };
}

function parseWorkerResult(value: unknown): JsonRecord {
  if (isRecord(value)) return value;
  if (typeof value === "string") {
    const parsed: unknown = JSON.parse(value);
    if (isRecord(parsed)) return parsed;
  }
  throw new Error("Mac Studio 폴더 결과 형식이 올바르지 않습니다.");
}

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value ? value : null;
}

function isHiddenSystemItem(rawName: string): boolean {
  const normalized = rawName.normalize("NFC").toLocaleLowerCase("en-US");
  return HIDDEN_SYSTEM_ITEMS.has(normalized) || normalized.startsWith("._");
}

/** Worker의 LIST_FOLDER JSON을 UI 계약으로 바꾸는 유일한 adapter다. */
export function mapRemoteWorkerFolderResult(
  value: unknown,
  requestedPath: string,
): RemoteNasFolderResult {
  const result = parseWorkerResult(value);

  if (result.ok === false) {
    throw new Error(apiErrorMessage(result, "NAS 폴더를 불러오지 못했습니다."));
  }

  if (result.root !== REMOTE_NAS_ROOT_NAME) {
    throw new Error("허용되지 않은 NAS Root 응답입니다.");
  }

  const expectedPath = normalizeRemoteNasRelativePath(requestedPath);
  const rawFolderPath = typeof result.path === "string" ? result.path : expectedPath;
  const folderPath = normalizeRemoteNasRelativePath(rawFolderPath);

  if (folderPath !== expectedPath) {
    throw new Error("요청한 폴더와 다른 NAS 경로가 반환되었습니다.");
  }

  if (!Array.isArray(result.entries)) {
    throw new Error("Mac Studio 폴더 목록 형식이 올바르지 않습니다.");
  }

  const entries = result.entries.flatMap<RemoteNasEntry>((entryValue) => {
    if (!isRecord(entryValue)) return [];

    const rawName = typeof entryValue.name === "string" ? entryValue.name : "";
    const rawPath = typeof entryValue.path === "string" ? entryValue.path : "";
    if (!rawName || !rawPath || isHiddenSystemItem(rawName)) return [];

    try {
      validateRemoteNasEntryName(rawName);
      const safeRawPath = normalizeRemoteNasRelativePath(rawPath);
      if (parentRemoteNasPath(safeRawPath) !== folderPath) return [];

      const rawType = typeof entryValue.type === "string" ? entryValue.type : entryValue.kind;
      const kind: RemoteNasEntryKind | null = rawType === "folder" || rawType === "directory"
        ? "directory"
        : rawType === "file"
          ? "file"
          : null;
      if (!kind) return [];

      const displayName = (typeof entryValue.displayName === "string" && entryValue.displayName
        ? entryValue.displayName
        : rawName).normalize("NFC");
      const displayPath = (typeof entryValue.displayPath === "string" && entryValue.displayPath
        ? entryValue.displayPath
        : toRemoteNasDisplayPath(safeRawPath)).normalize("NFC");

      return [{
        kind,
        name: rawName,
        // Unicode form(NFD 포함)은 normalizeRemoteNasRelativePath가 변경하지 않는다.
        path: safeRawPath,
        displayName,
        displayPath,
        sizeBytes: kind === "file" ? numberOrNull(entryValue.size ?? entryValue.sizeBytes) : null,
        modifiedAt: stringOrNull(entryValue.modifiedAt),
        mimeType: stringOrNull(entryValue.mimeType),
      }];
    } catch {
      return [];
    }
  });

  const displayPath = (typeof result.displayPath === "string"
    ? result.displayPath
    : toRemoteNasDisplayPath(folderPath)).normalize("NFC");

  return {
    rootName: REMOTE_NAS_ROOT_NAME,
    path: folderPath,
    displayPath,
    entries: sortRemoteNasEntries(entries),
    connection: { macStudio: "online", nas: "connected", source: "worker" },
    readOnly: true,
  };
}

export function createRemoteWorkerNasDataSource(
  options: RemoteWorkerNasDataSourceOptions = {},
): RemoteNasDataSource {
  const fetcher = options.fetcher ?? globalThis.fetch.bind(globalThis);
  const pollIntervalMs = options.pollIntervalMs ?? REMOTE_WORKER_NAS_POLL_INTERVAL_MS;
  const timeoutMs = options.timeoutMs ?? REMOTE_WORKER_NAS_TIMEOUT_MS;

  return {
    async listFolder(relativePath: string, requestOptions?: ListRemoteNasFolderOptions): Promise<RemoteNasFolderResult> {
      const signal = requestOptions?.signal;
      const path = normalizeRemoteNasRelativePath(relativePath);
      throwIfAborted(signal);

      let createResponse: Response;
      try {
        createResponse = await fetcher("/api/remote-jobs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "LIST_FOLDER",
            payload: { remote_path: path },
          }),
          signal,
        });
      } catch (error) {
        if (signal?.aborted) throw createAbortError();
        throw new RemoteNasDataSourceError(
          error instanceof Error ? error.message : "Mac Studio 작업 요청에 실패했습니다.",
          { macStudio: "unknown", nas: "unknown", source: "worker" },
        );
      }

      const createBody = await readJsonResponse(createResponse);
      if (!createResponse.ok) {
        throw new RemoteNasDataSourceError(
          apiErrorMessage(createBody, "Mac Studio 작업 요청에 실패했습니다."),
          { macStudio: "unknown", nas: "unknown", source: "worker" },
        );
      }

      let createdJob: RemoteJob;
      try {
        createdJob = parseJob(createBody);
      } catch (error) {
        throw new RemoteNasDataSourceError(
          error instanceof Error ? error.message : "Mac Studio 작업 정보를 읽지 못했습니다.",
          { macStudio: "unknown", nas: "unknown", source: "worker" },
        );
      }

      const startedAt = Date.now();
      while (Date.now() - startedAt < timeoutMs) {
        throwIfAborted(signal);

        let pollResponse: Response;
        try {
          pollResponse = await fetcher(`/api/remote-jobs?id=${encodeURIComponent(createdJob.id)}`, {
            method: "GET",
            cache: "no-store",
            signal,
          });
        } catch (error) {
          if (signal?.aborted) throw createAbortError();
          throw new RemoteNasDataSourceError(
            error instanceof Error ? error.message : "Mac Studio 작업 상태를 확인하지 못했습니다.",
            { macStudio: "unknown", nas: "unknown", source: "worker" },
          );
        }

        const pollBody = await readJsonResponse(pollResponse);
        if (!pollResponse.ok) {
          throw new RemoteNasDataSourceError(
            apiErrorMessage(pollBody, "Mac Studio 작업 상태를 확인하지 못했습니다."),
            { macStudio: "unknown", nas: "unknown", source: "worker" },
          );
        }

        let job: RemoteJob;
        try {
          job = parseJob(pollBody);
        } catch (error) {
          throw new RemoteNasDataSourceError(
            error instanceof Error ? error.message : "Mac Studio 작업 상태를 읽지 못했습니다.",
            { macStudio: "unknown", nas: "unknown", source: "worker" },
          );
        }

        if (job.action && job.action !== "LIST_FOLDER") {
          throw new RemoteNasDataSourceError(
            "요청한 폴더 작업과 다른 결과가 반환되었습니다.",
            { macStudio: "online", nas: "unknown", source: "worker" },
          );
        }

        if (job.status === "COMPLETED") {
          try {
            return mapRemoteWorkerFolderResult(job.result, path);
          } catch (error) {
            throw new RemoteNasDataSourceError(
              error instanceof Error ? error.message : "NAS 폴더 결과를 읽지 못했습니다.",
              { macStudio: "online", nas: "unknown", source: "worker" },
            );
          }
        }

        if (job.status === "FAILED") {
          throw new RemoteNasDataSourceError(
            job.error || job.message || "Mac Studio에서 NAS 폴더를 불러오지 못했습니다.",
            { macStudio: "online", nas: "unknown", source: "worker" },
          );
        }

        await waitForPolling(Math.max(0, pollIntervalMs), signal);
      }

      throw new RemoteNasDataSourceError(
        "Mac Studio 응답 시간이 초과되었습니다. 연결 상태를 확인하고 다시 시도해주세요.",
        { macStudio: "offline", nas: "unknown", source: "worker" },
      );
    },
  };
}

type MockNode = {
  kind: RemoteNasEntryKind;
  name: string;
  sizeBytes?: number;
  modifiedAt?: string;
  mimeType?: string;
};

const nfdJpgName = "진료실_현장_0001.JPG".normalize("NFD");

const MOCK_TREE: Readonly<Record<string, readonly MockNode[]>> = {
  "": [
    { kind: "directory", name: "0623_라셀의원", modifiedAt: "2026-06-24T10:18:00+09:00" },
    { kind: "directory", name: "0702_페이버요양병원", modifiedAt: "2026-07-03T09:44:00+09:00" },
    { kind: "directory", name: "0714_브랜딩더코어", modifiedAt: "2026-07-15T16:11:00+09:00" },
    { kind: "directory", name: "0811_세무사회", modifiedAt: "2026-08-12T13:06:00+09:00" },
    { kind: "directory", name: "0819_진보형교수님", modifiedAt: "2026-08-21T20:35:00+09:00" },
    { kind: "directory", name: "0825_제주관광공사", modifiedAt: "2026-08-27T08:50:00+09:00" },
    { kind: "directory", name: "0907_더힐피부과", modifiedAt: "2026-09-08T23:14:00+09:00" },
    { kind: "directory", name: "0911_WINF", modifiedAt: "2026-09-12T01:28:00+09:00" },
    { kind: "directory", name: "AI", modifiedAt: "2026-09-12T18:02:00+09:00" },
  ],
  "0623_라셀의원": [],
  "0702_페이버요양병원": [],
  "0714_브랜딩더코어": [],
  "0811_세무사회": [],
  "0819_진보형교수님": [
    { kind: "directory", name: "RAW", modifiedAt: "2026-08-21T20:32:00+09:00" },
    { kind: "directory", name: "JPG", modifiedAt: "2026-08-21T20:34:00+09:00" },
    { kind: "directory", name: "SELECT", modifiedAt: "2026-08-22T09:11:00+09:00" },
    { kind: "directory", name: "REPORT", modifiedAt: "2026-08-22T09:20:00+09:00" },
    { kind: "file", name: "촬영_메모.txt", sizeBytes: 12_842, modifiedAt: "2026-08-19T08:30:00+09:00", mimeType: "text/plain" },
    { kind: "file", name: "대표컷_0001.JPG", sizeBytes: 8_934_145, modifiedAt: "2026-08-21T20:30:00+09:00", mimeType: "image/jpeg" },
  ],
  "0819_진보형교수님/RAW": [
    { kind: "file", name: "DSC_8101.CR2", sizeBytes: 42_814_490, modifiedAt: "2026-08-19T10:14:22+09:00", mimeType: "image/x-canon-cr2" },
    { kind: "file", name: "DSC_8102.CR2", sizeBytes: 43_102_221, modifiedAt: "2026-08-19T10:14:27+09:00", mimeType: "image/x-canon-cr2" },
    { kind: "file", name: "DSC_8103.CR2", sizeBytes: 41_997_008, modifiedAt: "2026-08-19T10:14:33+09:00", mimeType: "image/x-canon-cr2" },
  ],
  "0819_진보형교수님/JPG": [
    { kind: "directory", name: "PREVIEW", modifiedAt: "2026-08-21T19:45:00+09:00" },
    { kind: "file", name: nfdJpgName, sizeBytes: 7_420_116, modifiedAt: "2026-08-19T10:14:22+09:00", mimeType: "image/jpeg" },
    { kind: "file", name: "원장프로필_0002.JPG", sizeBytes: 8_151_503, modifiedAt: "2026-08-19T11:02:08+09:00", mimeType: "image/jpeg" },
    { kind: "file", name: "상담장면_0003.JPG", sizeBytes: 7_882_046, modifiedAt: "2026-08-19T11:18:51+09:00", mimeType: "image/jpeg" },
  ],
  "0819_진보형교수님/JPG/PREVIEW": [
    { kind: "file", name: "contact-sheet.jpg", sizeBytes: 1_946_228, modifiedAt: "2026-08-21T19:44:00+09:00", mimeType: "image/jpeg" },
  ],
  "0819_진보형교수님/SELECT": [
    { kind: "file", name: "원장프로필_A.JPG", sizeBytes: 8_045_220, modifiedAt: "2026-08-22T09:08:00+09:00", mimeType: "image/jpeg" },
  ],
  "0819_진보형교수님/REPORT": [
    { kind: "file", name: "selection-report.json", sizeBytes: 84_208, modifiedAt: "2026-08-22T09:20:00+09:00", mimeType: "application/json" },
  ],
  "0825_제주관광공사": [],
  "0907_더힐피부과": [],
  "0911_WINF": [],
  "AI": [],
};

function toEntry(parentPath: string, node: MockNode): RemoteNasEntry {
  const path = joinRemoteNasPath(parentPath, node.name);
  return {
    kind: node.kind,
    name: node.name,
    path,
    displayName: toRemoteNasDisplayName(node.name),
    displayPath: toRemoteNasDisplayPath(path),
    sizeBytes: node.kind === "file" ? node.sizeBytes ?? 0 : null,
    modifiedAt: node.modifiedAt ?? null,
    mimeType: node.mimeType ?? null,
  };
}

function waitForMock(delayMs: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return Promise.reject(new DOMException("요청이 취소되었습니다.", "AbortError"));
  if (delayMs <= 0) return Promise.resolve();

  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, delayMs);
    signal?.addEventListener("abort", () => {
      clearTimeout(timer);
      reject(new DOMException("요청이 취소되었습니다.", "AbortError"));
    }, { once: true });
  });
}

export function createMockRemoteNasDataSource(options: { delayMs?: number } = {}): RemoteNasDataSource {
  const delayMs = options.delayMs ?? 90;

  return {
    async listFolder(relativePath: string, requestOptions?: ListRemoteNasFolderOptions): Promise<RemoteNasFolderResult> {
      const path = normalizeRemoteNasRelativePath(relativePath);
      await waitForMock(delayMs, requestOptions?.signal);

      const nodes = MOCK_TREE[path];
      if (!nodes) throw new Error("해당 폴더를 찾을 수 없습니다.");

      return {
        rootName: REMOTE_NAS_ROOT_NAME,
        path,
        displayPath: toRemoteNasDisplayPath(path),
        entries: sortRemoteNasEntries(nodes.map((node) => toEntry(path, node))),
        connection: { macStudio: "online", nas: "connected", source: "mock" },
        readOnly: true,
      };
    },
  };
}

export const mockRemoteNasDataSource = createMockRemoteNasDataSource();
export const remoteWorkerNasDataSource = createRemoteWorkerNasDataSource();
