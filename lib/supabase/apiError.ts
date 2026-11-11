type SupabaseLikeError = {
  code?: unknown;
  message?: unknown;
  details?: unknown;
};

export type DatabaseApiFailure = {
  status: number;
  code: "DATABASE_BUSY" | "DATABASE_ERROR";
  error: string;
  retryAfterSeconds?: number;
};

export function databaseApiFailure(cause: unknown): DatabaseApiFailure {
  const value = cause && typeof cause === "object" ? cause as SupabaseLikeError : {};
  const code = typeof value.code === "string" ? value.code : "";
  const message = [value.message, value.details].filter((item): item is string => typeof item === "string").join(" ");
  const transient = code === "PGRST003" || /connection pool|acquiring connection|timed out/i.test(message);

  if (transient) {
    return {
      status: 503,
      code: "DATABASE_BUSY",
      error: "데이터베이스 연결이 잠시 혼잡합니다. 자동으로 다시 시도합니다.",
      retryAfterSeconds: 2,
    };
  }

  return {
    status: 500,
    code: "DATABASE_ERROR",
    error: "사진선택 데이터를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.",
  };
}
