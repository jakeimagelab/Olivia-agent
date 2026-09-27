import { describe, expect, it, vi } from "vitest";
import { startPhotoWatcherWithLockRetry } from "./watcherStartup";

const scanResult = {
  sourceStatus: "ONLINE" as const,
  baselineInitialized: false,
  changedProjects: [],
  readyProjects: [],
  reviewProjects: [],
  errors: [],
};

describe("startPhotoWatcherWithLockRetry", () => {
  it("retries a lock conflict three times at five-second intervals", async () => {
    const start = vi.fn()
      .mockRejectedValueOnce(new Error("Photo Watcher가 이미 실행 중입니다."))
      .mockRejectedValueOnce(new Error("Photo Watcher가 이미 실행 중입니다."))
      .mockRejectedValueOnce(new Error("Photo Watcher가 이미 실행 중입니다."))
      .mockResolvedValue(scanResult);
    const wait = vi.fn(async () => undefined);
    await expect(startPhotoWatcherWithLockRetry({ start, attempts: 4, delayMs: 5_000, wait })).resolves.toEqual(scanResult);
    expect(start).toHaveBeenCalledTimes(4);
    expect(wait).toHaveBeenCalledTimes(3);
    expect(wait).toHaveBeenCalledWith(5_000);
  });

  it("does not retry non-lock failures", async () => {
    const start = vi.fn().mockRejectedValue(new Error("Permission denied"));
    const wait = vi.fn(async () => undefined);
    await expect(startPhotoWatcherWithLockRetry({ start, attempts: 4, wait })).rejects.toThrow("Permission denied");
    expect(start).toHaveBeenCalledTimes(1);
    expect(wait).not.toHaveBeenCalled();
  });
});
