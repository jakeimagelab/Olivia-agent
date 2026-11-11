import { describe, expect, it } from "vitest";
import { ApiResponseError, readApiResponse } from "@/lib/http/apiResponse";
import { databaseApiFailure } from "@/lib/supabase/apiError";

describe("readApiResponse", () => {
  it("reads a normal JSON response", async () => {
    await expect(readApiResponse<{ ok: true; value: number }>(Response.json({ ok: true, value: 7 }))).resolves.toEqual({ ok: true, value: 7 });
  });

  it("turns an empty 503 into a retryable user-facing error", async () => {
    const error = await readApiResponse(new Response("", { status: 503 }), "사진선택").catch((cause) => cause);
    expect(error).toBeInstanceOf(ApiResponseError);
    expect(error.retryable).toBe(true);
    expect(error.message).toContain("잠시 혼잡");
  });

  it("does not expose JSON parser errors for an HTML error page", async () => {
    const error = await readApiResponse(new Response("<html>failed</html>", { status: 500 }), "사진선택").catch((cause) => cause);
    expect(error).toBeInstanceOf(ApiResponseError);
    expect(error.message).not.toContain("JSON");
  });
});

describe("databaseApiFailure", () => {
  it("classifies PostgREST pool timeouts as retryable service unavailability", () => {
    expect(databaseApiFailure({ code: "PGRST003", message: "Timed out acquiring connection from connection pool." })).toEqual({
      status: 503,
      code: "DATABASE_BUSY",
      error: "데이터베이스 연결이 잠시 혼잡합니다. 자동으로 다시 시도합니다.",
      retryAfterSeconds: 2,
    });
  });
});
