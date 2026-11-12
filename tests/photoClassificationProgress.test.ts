import { describe, expect, it } from "vitest";
import { shouldPublishPhotoClassificationProgress } from "@/components/photo-classifier/usePhotoClassificationProgress";

describe("shouldPublishPhotoClassificationProgress", () => {
  it("always publishes stage starts, batches, and completion", () => {
    expect(shouldPublishPhotoClassificationProgress({
      next: { cur: 0, total: 100, msg: "시작" }, lastPublishedAt: 1000, now: 1001,
    })).toBe(true);
    expect(shouldPublishPhotoClassificationProgress({
      next: { cur: 20, total: 100, msg: "처리" }, lastPublishedAt: 1000, now: 1001,
    })).toBe(true);
    expect(shouldPublishPhotoClassificationProgress({
      next: { cur: 100, total: 100, msg: "완료" }, lastPublishedAt: 1000, now: 1001,
    })).toBe(true);
  });

  it("throttles intermediate paint updates for 120ms", () => {
    expect(shouldPublishPhotoClassificationProgress({
      next: { cur: 3, total: 100, msg: "처리" }, lastPublishedAt: 1000, now: 1119,
    })).toBe(false);
    expect(shouldPublishPhotoClassificationProgress({
      next: { cur: 3, total: 100, msg: "처리" }, lastPublishedAt: 1000, now: 1120,
    })).toBe(true);
  });
});
