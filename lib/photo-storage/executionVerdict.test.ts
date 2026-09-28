import { describe, expect, it } from "vitest";
import {
  buildFailureReport,
  requiresRerunConfirmation,
  resolveTimeoutVerdict,
  rerunConfirmationPrompt,
} from "./executionVerdict";

const requestedAt = "2026-09-27T21:28:00.000Z";

describe("photo execution timeout verdict", () => {
  it("요청 이후 갱신된 프로젝트는 시작됨으로 판정하고 실패나 원본 미변경을 말하지 않는다", () => {
    const verdict = resolveTimeoutVerdict({
      requestedAt,
      probe: { found: true, updatedAt: "2026-09-27T21:28:01.000Z" },
      lookupFailed: false,
    });
    const report = buildFailureReport({ label: "0923_연세라이프구강", failure: { kind: "timeout", verdict } });
    expect(verdict).toBe("started");
    expect(report).not.toContain("실패");
    expect(report).not.toContain("원본은 변경하지 않았어요");
  });

  it("프로젝트가 없거나 예전 프로젝트만 있으면 시작되지 않음으로 판정한다", () => {
    expect(resolveTimeoutVerdict({ requestedAt, probe: { found: false }, lookupFailed: false })).toBe("not_started");
    expect(resolveTimeoutVerdict({
      requestedAt,
      probe: { found: true, updatedAt: "2026-09-27T21:27:59.000Z" },
      lookupFailed: false,
    })).toBe("not_started");
  });

  it("조회 실패, 없는 갱신 시각, 깨진 시각은 확인 불가로 판정하며 원본 미변경을 붙이지 않는다", () => {
    expect(resolveTimeoutVerdict({ requestedAt, probe: null, lookupFailed: true })).toBe("unknown");
    expect(resolveTimeoutVerdict({ requestedAt, probe: { found: true, updatedAt: null }, lookupFailed: false })).toBe("unknown");
    expect(resolveTimeoutVerdict({ requestedAt, probe: { found: true, updatedAt: "not-a-date" }, lookupFailed: false })).toBe("unknown");
    const report = buildFailureReport({ label: "0923_연세라이프구강", failure: { kind: "timeout", verdict: "unknown" } });
    expect(report).not.toContain("원본은 변경하지 않았어요");
    expect(requiresRerunConfirmation("unknown")).toBe(true);
    expect(rerunConfirmationPrompt("0923_연세라이프구강")).toContain("두 번");
  });

  it("확실한 실패와 미시작만 원본 미변경을 말한다", () => {
    expect(buildFailureReport({ label: "폴더", failure: { kind: "certain" } })).toContain("원본은 변경하지 않았어요");
    expect(buildFailureReport({ label: "폴더", failure: { kind: "timeout", verdict: "not_started" } })).toContain("원본은 변경하지 않았어요");
  });
});
