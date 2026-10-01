import { normalizeRemoteNasRelativePath } from "@/lib/remote-nas/path";

type JsonRecord = Record<string, unknown>;

export type RemotePhotoWorkFolderCheck = {
  sourceFolder: string;
  workFolder: string;
  jpgWorkFolder: string;
  /** 기존 JPG 작업본은 실패가 아니라 SHA-256 확인 뒤 이어 복사할 수 있는 상태다. */
  jpgWorkFolderExists: boolean;
};

function record(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
}

function errorMessage(value: JsonRecord, fallback: string): string {
  return typeof value.error === "string" && value.error.trim() ? value.error : fallback;
}

function parseCheck(value: unknown, expectedSourceFolder: string): RemotePhotoWorkFolderCheck {
  const result = record(value);
  const sourceFolder = typeof result.sourceFolder === "string" ? result.sourceFolder : "";
  const workFolder = typeof result.workFolder === "string" ? result.workFolder : "";
  const jpgWorkFolder = typeof result.jpgWorkFolder === "string" ? result.jpgWorkFolder : "";
  if (sourceFolder !== expectedSourceFolder || !workFolder || !jpgWorkFolder || typeof result.jpgWorkFolderExists !== "boolean") {
    throw new Error("Agentstation 작업본 확인 결과가 올바르지 않습니다.");
  }
  return { sourceFolder, workFolder, jpgWorkFolder, jpgWorkFolderExists: result.jpgWorkFolderExists };
}

function waitForPoll(delayMs: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return Promise.reject(new DOMException("요청이 취소되었습니다.", "AbortError"));

  return new Promise<void>((resolve, reject) => {
    const onAbort = () => {
      clearTimeout(timer);
      reject(new DOMException("요청이 취소되었습니다.", "AbortError"));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, delayMs);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

/**
 * 선택한 NAS 폴더와 동일한 상대 경로의 Agentstation `JPG전체` 작업본만 확인한다.
 * 파일 생성·복사·삭제는 전혀 하지 않는 별도 원격 Worker 작업이다.
 */
export async function checkRemotePhotoWorkFolder(
  sourceFolderInput: string,
  options: { signal?: AbortSignal; fetcher?: typeof fetch; pollIntervalMs?: number; timeoutMs?: number } = {},
): Promise<RemotePhotoWorkFolderCheck> {
  const sourceFolder = normalizeRemoteNasRelativePath(sourceFolderInput);
  if (!sourceFolder) throw new Error("NAS Root가 아닌 촬영 폴더를 선택해주세요.");
  const fetcher = options.fetcher ?? globalThis.fetch.bind(globalThis);
  const response = await fetcher("/api/remote-jobs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "PHOTO_CHECK_WORK_FOLDER", payload: { source_folder: sourceFolder } }),
    signal: options.signal,
  });
  const created = record(await response.json().catch(() => ({})));
  if (!response.ok) throw new Error(errorMessage(created, "Agentstation 작업본 확인을 시작하지 못했습니다."));
  const job = record(created.job);
  const id = typeof job.id === "string" ? job.id : "";
  if (!id) throw new Error("Agentstation 작업본 확인 ID를 읽지 못했습니다.");

  const interval = Math.max(0, options.pollIntervalMs ?? 600);
  const timeoutMs = Math.max(interval, options.timeoutMs ?? 30_000);
  const startedAt = Date.now();
  while (true) {
    if (Date.now() - startedAt >= timeoutMs) {
      throw new Error("Agentstation 작업본 확인 시간이 초과되었습니다. Mac Studio 연결을 확인해주세요.");
    }
    await waitForPoll(interval, options.signal);
    const poll = await fetcher(`/api/remote-jobs?id=${encodeURIComponent(id)}`, {
      method: "GET", cache: "no-store", signal: options.signal,
    });
    const body = record(await poll.json().catch(() => ({})));
    if (!poll.ok) throw new Error(errorMessage(body, "Agentstation 작업본 확인 상태를 읽지 못했습니다."));
    const current = record(body.job);
    const status = typeof current.status === "string" ? current.status.toUpperCase() : "";
    if (status === "COMPLETED") return parseCheck(current.result, sourceFolder);
    if (status === "FAILED") throw new Error(errorMessage(current, "Agentstation 작업본 확인에 실패했습니다."));
    if (status !== "QUEUED" && status !== "RUNNING") throw new Error("Agentstation 작업본 확인 상태가 올바르지 않습니다.");
  }
}
