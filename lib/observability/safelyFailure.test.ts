import { afterEach, describe, expect, it, vi } from "vitest";
import { reportSafelyFailure, resetSafelyFailureReportsForTests } from "@/lib/observability/safelyFailure";

afterEach(() => {
  resetSafelyFailureReportsForTests();
  vi.restoreAllMocks();
});

describe("reportSafelyFailure", () => {
  it("keeps a swallowed failure visible and escalates the third failure within five minutes", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    reportSafelyFailure("emitOliviaEventSafely", "workflow.step_changed", new Error("network"), 1_000);
    reportSafelyFailure("emitOliviaEventSafely", "workflow.step_changed", new Error("network"), 2_000);
    expect(errorSpy).not.toHaveBeenCalled();

    reportSafelyFailure("emitOliviaEventSafely", "workflow.step_changed", new Error("network"), 3_000);

    expect(warnSpy).toHaveBeenCalledTimes(3);
    expect(warnSpy).toHaveBeenLastCalledWith("[safely/emitOliviaEventSafely]", "workflow.step_changed", "network");
    expect(errorSpy).toHaveBeenCalledWith(
      "[safely/emitOliviaEventSafely]",
      "workflow.step_changed",
      "5분 안에 3회 실패",
      "network",
    );
  });

  it("does not treat failures outside the five minute window as a repeat storm", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    reportSafelyFailure("recordPcrmActivitySafely", "quote_published", new Error("network"), 0);
    reportSafelyFailure("recordPcrmActivitySafely", "quote_published", new Error("network"), 1_000);
    reportSafelyFailure("recordPcrmActivitySafely", "quote_published", new Error("network"), 301_001);

    expect(errorSpy).not.toHaveBeenCalled();
  });
});
