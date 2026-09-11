import { resolveServerBaseUrl } from "@/lib/baseUrl";

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
