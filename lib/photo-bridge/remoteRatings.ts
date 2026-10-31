import { normalizeRemoteNasRelativePath } from "@/lib/remote-nas/path";

const POLL_INTERVAL_MS = 1_000;
const TIMEOUT_MS = 5 * 60_000;

type JsonRecord = Record<string, unknown>;

export type RemoteBridgeRating = {
  key: string;
  name: string;
  rating: number;
};

export type RemoteBridgeRatingResult = {
  folder: string;
  ratings: RemoteBridgeRating[];
  scanned: number;
};

type RemoteRatingOptions = {
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
  if (!isRecord(value) || !isRecord(value.job)) throw new Error("원격 별점 작업 정보를 읽지 못했습니다.");
  return value.job;
}

function parseRating(value: unknown): RemoteBridgeRating {
  if (!isRecord(value)) throw new Error("원격 별점 항목이 올바르지 않습니다.");
  const key = typeof value.key === "string" ? value.key : "";
  const name = typeof value.name === "string" ? value.name : "";
  const rating = typeof value.rating === "number" ? value.rating : Number.NaN;
  if (!key.trim() || !name.trim() || !Number.isInteger(rating) || rating < 1 || rating > 5) {
    throw new Error("원격 별점 항목이 올바르지 않습니다.");
  }
  return { key, name, rating };
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

export async function loadRemoteBridgeRatings(
  remotePath: string,
  options: RemoteRatingOptions = {},
): Promise<RemoteBridgeRatingResult> {
  const path = normalizeRemoteNasRelativePath(remotePath);
  if (!path) throw new Error("NAS 촬영 폴더를 선택해 주세요.");
  const fetcher = options.fetcher ?? globalThis.fetch.bind(globalThis);
  const signal = options.signal;
  const pollIntervalMs = options.pollIntervalMs ?? POLL_INTERVAL_MS;
  const timeoutMs = options.timeoutMs ?? TIMEOUT_MS;
  if (signal?.aborted) throw abortError();

  const createdResponse = await fetcher("/api/remote-jobs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "PHOTO_XMP_RATINGS", payload: { remote_path: path } }),
    signal,
  });
  const createdBody = await readJson(createdResponse);
  if (!createdResponse.ok) throw new Error(message(createdBody, "원격 별점 작업을 만들지 못했습니다."));
  const createdJob = jobFromBody(createdBody);
  const jobId = typeof createdJob.id === "string" ? createdJob.id : "";
  if (!jobId) throw new Error("원격 별점 작업 ID가 없습니다.");

  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (signal?.aborted) throw abortError();
    const response = await fetcher(`/api/remote-jobs?id=${encodeURIComponent(jobId)}`, {
      method: "GET",
      cache: "no-store",
      signal,
    });
    const body = await readJson(response);
    if (!response.ok) throw new Error(message(body, "원격 별점 상태를 확인하지 못했습니다."));
    const job = jobFromBody(body);
    if (job.action !== "PHOTO_XMP_RATINGS") throw new Error("다른 원격 작업 결과가 반환되었습니다.");
    if (job.status === "FAILED" || job.status === "CANCELED") {
      throw new Error(typeof job.error === "string" ? job.error : typeof job.message === "string" ? job.message : "원격 별점 작업에 실패했습니다.");
    }
    if (job.status === "COMPLETED") {
      if (!isRecord(job.result) || job.result.ok !== true || !Array.isArray(job.result.ratings)) {
        throw new Error("원격 별점 결과를 읽지 못했습니다.");
      }
      const scanned = typeof job.result.scanned === "number" ? job.result.scanned : Number.NaN;
      const folder = typeof job.result.folder === "string" ? job.result.folder : "";
      if (!Number.isInteger(scanned) || scanned < 0 || !folder.trim()) throw new Error("원격 별점 전체 장수가 올바르지 않습니다.");
      return { folder, scanned, ratings: job.result.ratings.map(parseRating) };
    }
    await wait(pollIntervalMs, signal);
  }
  throw new Error("원격 별점을 불러오는 시간이 초과되었습니다.");
}
