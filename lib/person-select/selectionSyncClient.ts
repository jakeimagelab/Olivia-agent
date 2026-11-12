import type { SelectionSyncDiff } from "./selectionSync";

export class SelectionSyncRequestError extends Error {
  constructor(
    message: string,
    readonly options?: { retryable?: boolean; retryAfterMs?: number },
  ) {
    super(message);
    this.name = "SelectionSyncRequestError";
  }
}

export async function readSelectionJsonResponse<T>(response: Response): Promise<T | null> {
  const text = await response.text();
  if (!text.trim()) return null;
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

export async function sendSelectionSyncBatch<T>({
  endpoint,
  clientId,
  diffs,
  responseKey,
}: {
  endpoint: string;
  clientId: string;
  diffs: SelectionSyncDiff[];
  responseKey: "draft" | "snapshot";
}) {
  const response = await fetch(endpoint, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ clientId, diffs }),
  });
  const result = await readSelectionJsonResponse<Record<string, unknown>>(response);
  const value = result?.[responseKey];
  if (!response.ok || result?.ok !== true || !value) {
    const retryAfterSeconds = Number(response.headers.get("Retry-After") ?? 0);
    const serverMessage = typeof result?.error === "string" ? result.error : "";
    throw new SelectionSyncRequestError(
      serverMessage || (response.ok ? "선택 저장 응답을 읽지 못했습니다." : "선택을 저장하지 못했습니다."),
      {
        retryable: ![400, 401, 403, 404, 410, 423].includes(response.status),
        retryAfterMs: retryAfterSeconds > 0 ? retryAfterSeconds * 1000 : undefined,
      },
    );
  }
  return value as T;
}
