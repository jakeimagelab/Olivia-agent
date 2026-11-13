import { describe, expect, it, vi } from "vitest";

import {
  createPersonSelectCaptureTimeCache,
  resolvePersonSelectRawCandidate,
} from "@/lib/person-select/node/rawMatchCandidateResolution";
import {
  normalizePersonSelectOutputFolderName,
  resolvePersonSelectSourcePath,
} from "@/lib/person-select/node/rawMatchPaths";
import type { PersonSelectRawMatchTarget } from "@/lib/person-select/rawMatch";
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

const choice: PersonSelectRawMatchTarget = {
  id: "image-1",
  ownerId: "person-1",
  ownerName: "홍길동",
  originalFileName: "PHOTO_0001.JPG",
  sourceRelPath: "홍길동/PHOTO_0001.JPG",
  customerRating: 5,
  customerColorLabel: null,
  markSavedAt: null,
  markConflict: false,
};

function raw(relPath: string, size = 10_000): PersonSelectRawFile {
  return {
    path: `/shoot/${relPath}`,
    relPath,
    name: "PHOTO_0001.CR2",
    size,
  };
}

describe("person select RAW candidate resolution", () => {
  it("returns every identical RAW copy for mark mode", async () => {
    const first = raw("RAW/원본/PHOTO_0001.CR2");
    const duplicate = raw("RAW/백업/PHOTO_0001.CR2");
    const times = new Map([
      ["/shoot/JPG/홍길동/PHOTO_0001.JPG", capture(10_000)],
      [first.path, capture(10_000)],
      [duplicate.path, capture(10_000)],
    ]);

    const resolution = await resolvePersonSelectRawCandidate({
      choice,
      rawCandidates: [first, duplicate],
      jpgRoot: "/shoot/JPG",
      captureFor: async (filePath) => times.get(filePath) ?? null,
    });

    expect(resolution.status).toBe("confirmed");
    expect(resolution.picked).toEqual(first);
    expect(resolution.duplicateRaws).toEqual([first, duplicate]);
  });

  it("keeps same-time RAW files with different sizes ambiguous", async () => {
    const first = raw("RAW/원본/PHOTO_0001.CR2", 10_000);
    const different = raw("RAW/백업/PHOTO_0001.CR2", 20_000);
    const resolution = await resolvePersonSelectRawCandidate({
      choice,
      rawCandidates: [first, different],
      jpgRoot: "/shoot/JPG",
      captureFor: async () => capture(10_000),
    });

    expect(resolution.status).toBe("multiple_candidates");
    expect(resolution.picked).toBeNull();
    expect(resolution.duplicateRaws).toEqual([]);
  });

  it("caches capture metadata reads, including failed reads", async () => {
    const read = vi.fn(async () => {
      throw new Error("invalid metadata");
    });
    const captureFor = createPersonSelectCaptureTimeCache(read);

    await expect(captureFor("/shoot/a.jpg")).resolves.toBeNull();
    await expect(captureFor("/shoot/a.jpg")).resolves.toBeNull();
    expect(read).toHaveBeenCalledTimes(1);
  });
});

describe("person select RAW match paths", () => {
  it("keeps source paths inside the JPG root", () => {
    expect(resolvePersonSelectSourcePath("/shoot/JPG", "홍길동/PHOTO_0001.JPG"))
      .toBe("/shoot/JPG/홍길동/PHOTO_0001.JPG");
    expect(() => resolvePersonSelectSourcePath("/shoot/JPG", "../RAW/PHOTO_0001.CR2"))
      .toThrow("촬영 폴더 밖");
  });

  it("normalizes unsafe output folder names", () => {
    expect(normalizePersonSelectOutputFolderName(" 홍/길:동 ")).toBe("홍_길_동");
    expect(normalizePersonSelectOutputFolderName("  ")).toBe("이름없음");
  });
});
