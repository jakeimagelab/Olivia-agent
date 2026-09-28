import { describe, expect, it, vi } from "vitest";
import { assertWrite, logWriteFailure } from "@/lib/db/assertWrite";

const failedWrite = { error: { message: "permission denied" } } as never;

describe("assertWrite", () => {
  it("throws when Supabase returns a write error", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    expect(() => assertWrite(failedWrite, "워크플로 단계 변경"))
      .toThrow("워크플로 단계 변경에 실패했습니다: permission denied");
    expect(errorSpy).toHaveBeenCalledWith("[db/write]", "워크플로 단계 변경", "permission denied");

    errorSpy.mockRestore();
  });

  it("does nothing for a successful primary write", () => {
    expect(() => assertWrite({ error: null }, "워크플로 단계 변경")).not.toThrow();
  });
});

describe("logWriteFailure", () => {
  it("reports optional-write failures without throwing", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    expect(logWriteFailure(failedWrite, "활동 기록")).toBe(false);
    expect(warnSpy).toHaveBeenCalledWith("[db/write-optional]", "활동 기록", "permission denied");

    warnSpy.mockRestore();
  });

  it("returns true for an optional write that succeeded", () => {
    expect(logWriteFailure({ error: null }, "활동 기록")).toBe(true);
  });
});
