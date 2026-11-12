import { describe, expect, it } from "vitest";

import {
  createSavedSortingSession,
  normalizeSavedSortingSession,
  readSavedSortingSession,
  removeSavedSortingSession,
  writeSavedSortingSession,
} from "@/lib/photo-classifier/sortingSession";
import type { FieldScene } from "@/lib/photo-classifier/types";

function createSession() {
  const fieldScenes = [{
    index: 1,
    folderName: "Scene01",
    editedName: "상담",
    startTime: 10,
    endTime: 20,
    fileCount: 1,
    sceneType: "consultation",
    suggestedName: "상담",
    aiConfidence: 0.9,
    aiReason: "test",
    boundaryBefore: undefined,
    approved: true,
    files: [{ name: "IMG_0001.JPG" }],
  }] as unknown as FieldScene[];
  return createSavedSortingSession({
    step: 3,
    rootDirName: "촬영",
    department: "dermatology",
    gapMinutes: 3.5,
    fastAnalyzeMode: false,
    departmentLogicEnabled: true,
    aiNamingEnabled: false,
    qualityAnalysisEnabled: false,
    profileClassificationEnabled: false,
    rawSelectMode: "copy",
    fieldRawCount: 1,
    fieldStats: null,
    classificationJobState: "WAITING_REVIEW",
    boundaryDecisions: [],
    sceneCorrections: [],
    fieldScenes,
    savedAt: "2026-11-13T00:00:00.000Z",
  });
}

describe("photo sorting session", () => {
  it("serializes scene summaries without file handles", () => {
    const session = createSession();
    expect(session.sceneSummary).toEqual([expect.objectContaining({
      folderName: "Scene01",
      editedName: "상담",
      fileNames: ["IMG_0001.JPG"],
      approved: true,
    })]);
  });

  it("clamps legacy RAW steps and rejects unsupported sessions", () => {
    const session = createSession();
    expect(normalizeSavedSortingSession({ ...session, step: 6 })?.step).toBe(4);
    expect(normalizeSavedSortingSession({ ...session, version: 3 })).toBeNull();
    expect(normalizeSavedSortingSession({ ...session, step: 1 })).toBeNull();
  });

  it("reads, writes, and removes the established storage key", () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
    };
    const session = createSession();

    writeSavedSortingSession(session, storage);
    expect(readSavedSortingSession(storage)).toEqual(session);
    removeSavedSortingSession(storage);
    expect(readSavedSortingSession(storage)).toBeNull();
  });
});
