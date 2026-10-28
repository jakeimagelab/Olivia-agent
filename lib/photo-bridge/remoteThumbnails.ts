import { normalizeRemoteNasRelativePath } from "@/lib/remote-nas/path";

const PAGE_SIZE = 400;
const POLL_INTERVAL_MS = 1_000;
const TIMEOUT_MS = 5 * 60_000;

type JsonRecord = Record<string, unknown>;

export type RemoteBridgeThumbnail = {
  relativePath: string;
  name: string;
  size: number;
  lastModified: number;
  dataUrl: string;
};

export type RemoteBridgeThumbnailResult = {
  folder: string;
  thumbs: RemoteBridgeThumbnail[];
  total: number;
};

type RemoteThumbnailOptions = {
  fetcher?: typeof fetch;
  signal?: AbortSignal;
  pollIntervalMs?: number;
  timeoutMs?: number;
};

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function message(value: unknown, fallback: string) {
  return isRecord(value) && typeof value.error === "string" && value.error.trim()
    ? value.error.trim()
    : fallback;
}

async function readJson(response: Response): Promise<unknown> {
  return response.json().catch(() => ({}));
}

function jobFromBody(value: unknown): JsonRecord {
  if (!isRecord(value) || !isRecord(value.job)) throw new Error("원격 썸네일 작업 정보를 읽지 못했습니다.");
  return value.job;
}

function parseThumb(value: unknown): RemoteBridgeThumbnail {
  if (!isRecord(value)) throw new Error("원격 썸네일 항목이 올바르지 않습니다.");
  const relativePath = typeof value.relativePath === "string" ? value.relativePath : "";
  const name = typeof value.name === "string" ? value.name : "";
  const size = typeof value.size === "number" ? value.size : Number.NaN;
  const lastModified = typeof value.lastModified === "number" ? value.lastModified : Number.NaN;
  const dataUrl = typeof value.dataUrl === "string" ? value.dataUrl : "";
  if (!relativePath || !name || !Number.isFinite(size) || size < 0 || !Number.isFinite(lastModified) || !dataUrl.startsWith("data:image/jpeg;base64,")) {
    throw new Error("원격 썸네일 항목이 올바르지 않습니다.");
  }
  return { relativePath, name, size, lastModified, dataUrl };
}

function abortError() {
  return new DOMException("작업이 취소되었습니다.", "AbortError");
}

async function wait(ms: number, signal?: AbortSignal) {
  if (signal?.aborted) throw abortError();
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(timer);
      reject(abortError());
    }, { once: true });
  });
}

async function fetchPage(
  remotePath: string,
  offset: number,
  options: Required<Pick<RemoteThumbnailOptions, "fetcher" | "pollIntervalMs" | "timeoutMs">> & Pick<RemoteThumbnailOptions, "signal">,
) {
  if (options.signal?.aborted) throw abortError();
  const createdResponse = await options.fetcher("/api/remote-jobs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "PHOTO_THUMBS",
      payload: { remote_path: remotePath, max_count: PAGE_SIZE, offset },
    }),
    signal: options.signal,
  });
  const createdBody = await readJson(createdResponse);
  if (!createdResponse.ok) throw new Error(message(createdBody, "원격 썸네일 작업을 만들지 못했습니다."));
  const createdJob = jobFromBody(createdBody);
  const jobId = typeof createdJob.id === "string" ? createdJob.id : "";
  if (!jobId) throw new Error("원격 썸네일 작업 ID가 없습니다.");

  const startedAt = Date.now();
  while (Date.now() - startedAt < options.timeoutMs) {
    if (options.signal?.aborted) throw abortError();
    const response = await options.fetcher(`/api/remote-jobs?id=${encodeURIComponent(jobId)}`, {
      method: "GET",
      cache: "no-store",
      signal: options.signal,
    });
    const body = await readJson(response);
    if (!response.ok) throw new Error(message(body, "원격 썸네일 상태를 확인하지 못했습니다."));
    const job = jobFromBody(body);
    if (job.action !== "PHOTO_THUMBS") throw new Error("다른 원격 작업 결과가 반환되었습니다.");
    if (job.status === "FAILED" || job.status === "CANCELED") {
      throw new Error(typeof job.error === "string" ? job.error : typeof job.message === "string" ? job.message : "원격 썸네일 작업에 실패했습니다.");
    }
    if (job.status === "COMPLETED") {
      if (!isRecord(job.result) || job.result.ok !== true || !Array.isArray(job.result.thumbs)) {
        throw new Error("원격 썸네일 결과를 읽지 못했습니다.");
      }
      const total = typeof job.result.total === "number" ? job.result.total : Number.NaN;
      const folder = typeof job.result.folder === "string" ? job.result.folder : "";
      if (!Number.isInteger(total) || total < 0 || !folder) throw new Error("원격 썸네일 전체 장수가 올바르지 않습니다.");
      return { folder, total, thumbs: job.result.thumbs.map(parseThumb) };
    }
    await wait(options.pollIntervalMs, options.signal);
  }
  throw new Error("원격 썸네일을 불러오는 시간이 초과되었습니다.");
}

export async function loadRemoteBridgeThumbnails(
  remotePath: string,
  options: RemoteThumbnailOptions = {},
): Promise<RemoteBridgeThumbnailResult> {
  const path = normalizeRemoteNasRelativePath(remotePath);
  if (!path) throw new Error("NAS 촬영 폴더를 선택해 주세요.");
  const resolved = {
    fetcher: options.fetcher ?? globalThis.fetch.bind(globalThis),
    pollIntervalMs: options.pollIntervalMs ?? POLL_INTERVAL_MS,
    timeoutMs: options.timeoutMs ?? TIMEOUT_MS,
    signal: options.signal,
  };
  const thumbs: RemoteBridgeThumbnail[] = [];
  let total: number | null = null;
  let folder = path;

  while (total === null || thumbs.length < total) {
    const page = await fetchPage(path, thumbs.length, resolved);
    if (total !== null && page.total !== total) throw new Error("원격 썸네일 전체 장수가 조회 중 달라졌습니다. 폴더를 다시 선택해 주세요.");
    total = page.total;
    folder = page.folder;
    if (page.thumbs.length > PAGE_SIZE) throw new Error("원격 썸네일 묶음 크기가 400장을 초과했습니다.");
    if (page.thumbs.length === 0 && thumbs.length < total) throw new Error(`원격 썸네일이 중간에 끊겼습니다. ${thumbs.length}/${total}장만 받았습니다.`);
    thumbs.push(...page.thumbs);
  }

  if (thumbs.length !== total) throw new Error(`원격 썸네일 장수가 맞지 않습니다. ${thumbs.length}/${total}장입니다.`);
  const unique = new Set(thumbs.map((thumb) => thumb.relativePath));
  if (unique.size !== thumbs.length) throw new Error("원격 썸네일에 중복 파일이 있습니다. 폴더를 다시 선택해 주세요.");
  return { folder, thumbs, total };
}
