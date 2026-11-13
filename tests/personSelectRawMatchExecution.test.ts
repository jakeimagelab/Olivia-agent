import { describe, expect, it } from "vitest";

import { executePersonSelectRawMatch } from "@/lib/person-select/node/rawMatchExecution";
import { normalizePersonSelectRawLabelNames, type PersonSelectRawMatchTarget } from "@/lib/person-select/rawMatch";
import type { PersonSelectRawFile } from "@/lib/person-select/node/rawFileIndex";
import type { CaptureTime } from "@/lib/selectMatch/captureTime";

function capture(timestampMs: number): CaptureTime {
  return {
    timestampMs,
    dateTimeOriginal: "2026:11:13 10:00:00",
    subSecTimeOriginal: null,
    hasSubseconds: false,
  };
}

function target(overrides: Partial<PersonSelectRawMatchTarget> = {}): PersonSelectRawMatchTarget {
  return {
    id: "image-1",
    ownerId: "person-1",
    ownerName: "홍길동",
    originalFileName: "PHOTO_0001.JPG",
    sourceRelPath: "홍길동/PHOTO_0001.JPG",
    customerRating: 5,
    customerColorLabel: null,
    markSavedAt: null,
    markConflict: false,
    ...overrides,
  };
}

function raw(relPath: string, size = 10_000): PersonSelectRawFile {
  return {
    path: `/shoot/${relPath}`,
    relPath,
    name: "PHOTO_0001.CR2",
    size,
  };
}

describe("person select RAW match execution", () => {
  it("copies only the same-name RAW whose capture time matches", async () => {
    const right = raw("RAW/홍길동/PHOTO_0001.CR2");
    const wrong = raw("RAW/다른촬영/PHOTO_0001.CR2");
    const copied: string[] = [];
    const times = new Map([
      ["/shoot/JPG/홍길동/PHOTO_0001.JPG", capture(10_000)],
      [right.path, capture(10_500)],
      [wrong.path, capture(30_000)],
    ]);

    const result = await executePersonSelectRawMatch({
      targets: [target()],
      rawIndex: new Map([["photo_0001", [wrong, right]]]),
      jpgRoot: "/shoot/JPG",
      shootingRoot: "/shoot",
      outputRoot: "/shoot/Selected_RAW",
      mode: "copy",
      labelNames: normalizePersonSelectRawLabelNames(undefined),
      rawMarkJobId: "job-copy",
      dependencies: {
        readCaptureTime: async (filePath) => times.get(filePath) ?? null,
        createDirectory: async () => undefined,
        copyRaw: async ({ source }) => {
          copied.push(source);
          return { alreadyExisted: false };
        },
      },
    });

    expect(copied).toEqual([right.path]);
    expect(result.matched).toEqual([{
      name: "홍길동",
      jpg: "PHOTO_0001.JPG",
      raw: right.relPath,
      attributeVerified: true,
    }]);
    expect(result.reviewRequired).toEqual([]);
  });

  it("marks every identical RAW copy but counts the selected photo once", async () => {
    const first = raw("RAW/원본/PHOTO_0001.CR2");
    const duplicate = raw("RAW/백업/PHOTO_0001.CR2");
    const marked: string[] = [];
    const times = new Map([
      ["/shoot/JPG/홍길동/PHOTO_0001.JPG", capture(10_000)],
      [first.path, capture(10_000)],
      [duplicate.path, capture(10_000)],
    ]);

    const result = await executePersonSelectRawMatch({
      targets: [target({ customerColorLabel: 6 })],
      rawIndex: new Map([["photo_0001", [first, duplicate]]]),
      jpgRoot: "/shoot/JPG",
      shootingRoot: "/shoot",
      outputRoot: "/shoot/Selected_RAW",
      mode: "mark",
      labelNames: normalizePersonSelectRawLabelNames(undefined),
      rawMarkJobId: "job-mark",
      dependencies: {
        readCaptureTime: async (filePath) => times.get(filePath) ?? null,
        markRawSidecar: async ({ raw: candidate }) => {
          marked.push(candidate.relPath);
          return {
            rawPath: candidate.relPath,
            sidecarPath: `${candidate.relPath}.xmp`,
            created: true,
          };
        },
      },
    });

    expect(marked).toEqual([first.relPath, duplicate.relPath]);
    expect(result.markedSidecars).toHaveLength(2);
    expect(result.ratingCount).toBe(1);
    expect(result.colorCount).toBe(1);
  });
});
