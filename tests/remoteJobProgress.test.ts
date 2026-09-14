import { describe, expect, it } from "vitest";
import { parseRemoteJobProgress } from "@/lib/remote-jobs/progress";
import { isRemoteWorkerOnline } from "@/lib/remote-jobs/workerPresence";

describe("remote job progress", () => {
  it("accepts the existing runner progress contract", () => {
    expect(parseRemoteJobProgress({
      stage: "ANALYZING",
      current: 324,
      total: 673,
      message: "사진 특징을 분석하고 있습니다.",
    })).toEqual({
      stage: "ANALYZING",
      current: 324,
      total: 673,
      message: "사진 특징을 분석하고 있습니다.",
    });
  });

  it("rejects invalid stages and impossible counts", () => {
    expect(() => parseRemoteJobProgress({ stage: "DELETING", message: "x" })).toThrow();
    expect(() => parseRemoteJobProgress({ stage: "STAGING", current: 2, total: 1, message: "x" })).toThrow();
  });

  it("accepts JPG staging progress and byte counters", () => {
    expect(parseRemoteJobProgress({
      stage: "COPYING",
      current: 3,
      total: 10,
      copiedBytes: 300,
      totalBytes: 1000,
      message: "JPG 복사 중",
    })).toMatchObject({ stage: "COPYING", current: 3, total: 10, copiedBytes: 300, totalBytes: 1000 });
  });
});

describe("remote worker presence", () => {
  const now = Date.parse("2026-09-13T12:00:15.000Z");

  it("derives online status from the last heartbeat", () => {
    expect(isRemoteWorkerOnline("2026-09-13T12:00:05.000Z", now)).toBe(true);
    expect(isRemoteWorkerOnline("2026-09-13T11:59:00.000Z", now)).toBe(false);
    expect(isRemoteWorkerOnline(null, now)).toBe(null);
  });
});
