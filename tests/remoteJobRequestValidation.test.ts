import { describe, expect, it } from "vitest";
import {
  canRunOnNonPrimaryWorker,
  finiteNumber,
  isRemoteJobUuid,
  normalizeRemoteJobAction,
  safeFileNames,
  safeProjectSubpath,
  safeWorkerAbsolutePath,
  safeWorkerRelativePath,
} from "@/lib/remote-jobs/requestValidation";

describe("remote job request validation", () => {
  it("normalizes known actions and rejects unknown actions", () => {
    expect(normalizeRemoteJobAction(" person_select_raw_match ")).toBe("PERSON_SELECT_RAW_MATCH");
    expect(normalizeRemoteJobAction("DELETE_EVERYTHING")).toBeNull();
    expect(normalizeRemoteJobAction(null)).toBeNull();
  });

  it("limits secondary workers to read-only and video actions", () => {
    expect(canRunOnNonPrimaryWorker("LIST_FOLDER")).toBe(true);
    expect(canRunOnNonPrimaryWorker("VIDEO_AUDIO_EXTRACT")).toBe(true);
    expect(canRunOnNonPrimaryWorker("PERSON_SELECT_RAW_MATCH")).toBe(false);
  });

  it("accepts only versioned UUIDs used by remote jobs", () => {
    expect(isRemoteJobUuid("018e2f30-92af-78b1-8f21-67f4404f5027")).toBe(true);
    expect(isRemoteJobUuid("not-a-uuid")).toBe(false);
    expect(isRemoteJobUuid(123)).toBe(false);
  });

  it("keeps safe paths while rejecting traversal and absolute relative paths", () => {
    expect(safeProjectSubpath(undefined, "씬별분류")).toBe("씬별분류");
    expect(safeWorkerAbsolutePath("/Volumes/Agentstation/촬영/RAW/", "RAW")).toBe("/Volumes/Agentstation/촬영/RAW");
    expect(safeWorkerRelativePath("사람/사진.CR2", "RAW")).toBe("사람/사진.CR2");
    expect(() => safeProjectSubpath("../RAW", "씬별분류")).toThrow("올바르지 않습니다");
    expect(() => safeWorkerRelativePath("/Volumes/RAW", "RAW")).toThrow("상대경로");
    expect(() => safeWorkerAbsolutePath("/Volumes/../private", "RAW")).toThrow("상위 경로");
  });

  it("validates filename batches and bounded numbers", () => {
    expect(safeFileNames([" A.JPG ", "B.JPG"], { required: true, max: 2 })).toEqual(["A.JPG", "B.JPG"]);
    expect(() => safeFileNames(["folder/A.JPG"], { required: true, max: 2 })).toThrow("경로");
    expect(finiteNumber(2, "count", 1, 3, true)).toBe(2);
    expect(() => finiteNumber(2.5, "count", 1, 3, true)).toThrow("올바르지 않습니다");
  });
});
