import { resolveServerBaseUrl } from "@/lib/baseUrl";

// lib/remote-nas/remoteNasDataSource.ts의 listFolder()와 lib/photo-classifier/remotePhotoSort.ts의
// createRemotePhotoSortJob()는 둘 다 기본적으로 globalThis.fetch를 상대경로("/api/remote-jobs")로
// 호출한다 — 브라우저에서는 문제없지만 Hermes tool executor(Vercel Node 서버 함수)에서 호출하면
// 상대경로를 resolve할 origin이 없다. 이 fetcher를 두 함수의 fetcher 옵션에 그대로 주입하면
// callOliviaApi와 동일하게 절대경로+내부 인증 헤더로 요청한다(원격 파이프라인 자체는 손대지 않는다).
export const internalFetcher: typeof fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
  const path = typeof input === "string" ? input : input.toString();
  return fetch(`${resolveServerBaseUrl()}${path}`, {
    ...init,
    headers: {
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...(process.env.INTERNAL_API_KEY ? { "x-internal-key": process.env.INTERNAL_API_KEY } : {}),
      ...init?.headers,
    },
  });
}) as typeof fetch;

export async function callOliviaApi<T extends Record<string, unknown>>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(`${resolveServerBaseUrl()}${path}`, {
    ...init,
    headers: {
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...(process.env.INTERNAL_API_KEY ? { "x-internal-key": process.env.INTERNAL_API_KEY } : {}),
      ...init?.headers,
    },
    cache: "no-store",
  });
  const payload = await response.json().catch(() => ({})) as T & { ok?: boolean; error?: string };
  if (!response.ok || payload.ok === false) {
    throw new Error(payload.error || `Olivia API 요청에 실패했어요. (${response.status})`);
  }
  return payload;
}
