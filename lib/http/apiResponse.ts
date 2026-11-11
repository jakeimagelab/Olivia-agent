export type ApiResponseShape = {
  ok?: boolean;
  error?: string;
  code?: string;
  [key: string]: unknown;
};

export class ApiResponseError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly retryable: boolean;

  constructor(message: string, options: { status: number; code?: string; retryable?: boolean }) {
    super(message);
    this.name = "ApiResponseError";
    this.status = options.status;
    this.code = options.code;
    this.retryable = options.retryable ?? false;
  }
}

function fallbackMessage(response: Response, label: string) {
  if (response.status === 503 || response.status === 504) return `${label} 서버가 잠시 혼잡합니다. 잠시 후 다시 시도해 주세요.`;
  if (response.status === 401) return "로그인이 만료되었습니다. 다시 로그인해 주세요.";
  return `${label} 요청을 처리하지 못했습니다. (${response.status || "응답 없음"})`;
}

/**
 * Reads API responses without leaking the browser's opaque JSON parse error to users.
 * Next/Vercel error pages and empty upstream responses are converted to an actionable error.
 */
export async function readApiResponse<T extends ApiResponseShape>(response: Response, label = "서버"): Promise<T> {
  const text = await response.text();
  let body: ApiResponseShape | null = null;

  if (text.trim()) {
    try {
      body = JSON.parse(text) as ApiResponseShape;
    } catch {
      throw new ApiResponseError(fallbackMessage(response, label), {
        status: response.status,
        retryable: response.ok || response.status >= 500 || response.status === 0,
      });
    }
  }

  if (!body) {
    throw new ApiResponseError(fallbackMessage(response, label), {
      status: response.status,
      retryable: response.ok || response.status >= 500 || response.status === 0,
    });
  }

  if (!response.ok || body.ok === false) {
    throw new ApiResponseError(
      typeof body.error === "string" && body.error.trim() ? body.error : fallbackMessage(response, label),
      {
        status: response.status,
        code: typeof body.code === "string" ? body.code : undefined,
        retryable: response.status === 429 || response.status === 503 || response.status === 504,
      },
    );
  }

  return body as T;
}

export function isRetryableApiError(error: unknown): error is ApiResponseError {
  return error instanceof ApiResponseError && error.retryable;
}
