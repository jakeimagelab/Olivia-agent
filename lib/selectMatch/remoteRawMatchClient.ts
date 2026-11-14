import {
  parseRemoteRawMatchJob,
  remoteRawMatchErrorMessage,
} from "@/lib/selectMatch/remoteRawMatchParser";
import type {
  RemoteRawMatchCopyPayload,
  RemoteRawMatchCopyResult,
  RunRemoteRawMatchOptions,
} from "@/lib/selectMatch/remoteRawMatchTypes";

function abortError(): DOMException {
  return new DOMException("작업이 취소되었습니다.", "AbortError");
}

async function wait(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) throw abortError();
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(timer);
      reject(abortError());
    }, { once: true });
  });
}

export function remoteRawMatchUnavailableReason(workerOnline: boolean | null): string | null {
  return workerOnline === true ? null : "맥스튜디오 워커가 꺼져 있어 원본 속성을 지킬 수 없습니다";
}

/** RAW 매칭 실행 버튼을 막을 수 있는 두 가지 조건을 한 곳에서 계산한다. */
export function remoteRawMatchRunDisabledReason(
  approvedMatchCount: number,
  workerOnline: boolean | null,
): string | null {
  if (approvedMatchCount < 1) return "확정된 RAW가 1장 이상 필요합니다.";
  if (workerOnline !== true) return "Mac Studio 워커가 연결되어 있지 않습니다.";
  return null;
}

export async function runRemoteRawMatchCopy(
  payload: RemoteRawMatchCopyPayload,
  options: RunRemoteRawMatchOptions,
): Promise<RemoteRawMatchCopyResult> {
  const unavailableReason = remoteRawMatchUnavailableReason(options.workerOnline);
  if (unavailableReason) throw new Error(unavailableReason);
  const fetcher = options.fetcher ?? globalThis.fetch.bind(globalThis);
  const signal = options.signal;
  if (signal?.aborted) throw abortError();
  const createdResponse = await fetcher("/api/remote-jobs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "PHOTO_RAW_MATCH_COPY", payload }),
    signal,
  });
  const createdBody: unknown = await createdResponse.json().catch(() => ({}));
  if (!createdResponse.ok) {
    throw new Error(remoteRawMatchErrorMessage(createdBody, "Mac Studio RAW 복사 작업을 만들지 못했습니다."));
  }
  const created = parseRemoteRawMatchJob(createdBody);
  options.onJob?.(created);

  const startedAt = Date.now();
  const timeoutMs = options.timeoutMs ?? 60 * 60_000;
  const pollIntervalMs = options.pollIntervalMs ?? 1_000;
  while (Date.now() - startedAt < timeoutMs) {
    if (signal?.aborted) throw abortError();
    const response = await fetcher(`/api/remote-jobs?id=${encodeURIComponent(created.id)}`, {
      method: "GET",
      cache: "no-store",
      signal,
    });
    const body: unknown = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(remoteRawMatchErrorMessage(body, "Mac Studio RAW 복사 상태를 확인하지 못했습니다."));
    }
    const job = parseRemoteRawMatchJob(body);
    options.onJob?.(job);
    if (job.status === "COMPLETED") {
      if (!job.result) throw new Error("Mac Studio RAW 복사 결과가 없습니다.");
      return job.result;
    }
    if (job.status === "FAILED" || job.status === "CANCELED") {
      throw new Error(job.error || job.message || "Mac Studio RAW 복사 작업에 실패했습니다.");
    }
    await wait(pollIntervalMs, signal);
  }
  throw new Error("Mac Studio에서 RAW 복사 작업은 계속 진행 중입니다. 잠시 후 다시 확인해 주세요.");
}
