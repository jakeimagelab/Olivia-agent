const WORKER_STATUS_CLIENT_TTL_MS = 15_000;

type CacheEntry = { expiresAt: number; value: unknown };

const cache = new Map<string, CacheEntry>();
const inFlight = new Map<string, Promise<unknown>>();

export function loadRemoteWorkerStatus<T = unknown>(query = ""): Promise<T> {
  const key = query ? `/api/remote-workers/status?${query}` : "/api/remote-workers/status";
  const now = Date.now();
  const cached = cache.get(key);
  if (cached && cached.expiresAt > now) return Promise.resolve(cached.value as T);

  const pending = inFlight.get(key);
  if (pending) return pending as Promise<T>;

  const request = fetch(key, { cache: "no-store" }).then(async (response) => {
    const body = await response.json().catch(() => null);
    if (!response.ok || !body) throw new Error(body?.error || "Mac Studio 상태를 확인하지 못했습니다.");
    cache.set(key, { expiresAt: Date.now() + WORKER_STATUS_CLIENT_TTL_MS, value: body });
    return body;
  }).finally(() => {
    inFlight.delete(key);
  });
  inFlight.set(key, request);
  return request as Promise<T>;
}
