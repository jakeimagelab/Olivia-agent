import { describe, expect, it, vi } from "vitest";
import { createLegacyRouteLoadController } from "@/lib/olivia/legacyRouteLoad";

describe("legacy route load attempts", () => {
  it("keeps a successful frame ready after the old timeout", () => {
    vi.useFakeTimers();
    const failed = vi.fn();
    const controller = createLegacyRouteLoadController(15_000);
    const attempt = controller.begin(failed);
    expect(controller.settle(attempt)).toBe(true);
    vi.advanceTimersByTime(20_000);
    expect(failed).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it("times out only the current attempt and ignores stale events", () => {
    vi.useFakeTimers();
    const failed = vi.fn();
    const controller = createLegacyRouteLoadController(15_000);
    const first = controller.begin(failed);
    const second = controller.begin(failed);
    expect(controller.settle(first)).toBe(false);
    vi.advanceTimersByTime(15_000);
    expect(failed).toHaveBeenCalledWith(second);
    expect(controller.settle(first)).toBe(false);
    vi.useRealTimers();
  });

  it("cancels href changes, retries, and unmounts", () => {
    vi.useFakeTimers();
    const failed = vi.fn();
    const controller = createLegacyRouteLoadController(15_000);
    const first = controller.begin(failed);
    controller.cancel(first);
    const retry = controller.begin(failed);
    controller.dispose();
    vi.advanceTimersByTime(20_000);
    expect(failed).not.toHaveBeenCalled();
    expect(controller.settle(retry)).toBe(false);
    vi.useRealTimers();
  });
});
