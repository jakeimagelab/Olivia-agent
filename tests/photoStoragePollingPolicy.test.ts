import { describe, expect, it } from "vitest";
import type { PhotoStorageProject } from "@/lib/photo-storage/types";
import { photoProjectPollDelayMs } from "@/lib/photo-storage/pollingPolicy";

function project(status: PhotoStorageProject["status"]): PhotoStorageProject {
  return { status } as PhotoStorageProject;
}

describe("photo project polling policy", () => {
  it("stops recurring polling when there is no active or actionable project", () => {
    expect(photoProjectPollDelayMs([], false)).toBeNull();
    expect(photoProjectPollDelayMs([project("COPY_COMPLETED")], false)).toBeNull();
  });

  it("uses fast polling only while file work is active", () => {
    expect(photoProjectPollDelayMs([project("MERGING")], false)).toBe(3_000);
    expect(photoProjectPollDelayMs([project("MERGE_APPROVED")], false)).toBe(3_000);
    expect(photoProjectPollDelayMs([project("CLASSIFYING")], false)).toBe(3_000);
  });

  it("slows approval states and hidden tabs", () => {
    expect(photoProjectPollDelayMs([project("READY")], false)).toBe(15_000);
    expect(photoProjectPollDelayMs([project("MERGE_COMPLETED")], true)).toBe(60_000);
    expect(photoProjectPollDelayMs([], true)).toBeNull();
  });
});
