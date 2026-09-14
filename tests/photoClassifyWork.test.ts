import { afterEach, describe, expect, it } from "vitest";
import { mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { parseClassificationOptions, runPhotoClassifyWork } from "@/lib/photo-classifier/node/photoClassifyWork";

const tempRoots: string[] = [];

async function setup() {
  const base = await mkdtemp(path.join(os.tmpdir(), "olivia-photo-classify-"));
  tempRoots.push(base);
  const roots = { sourceRoot: path.join(base, "ssd1"), workRoot: path.join(base, "ssd2") };
  const work = path.join(roots.workRoot, "0914_test");
  await mkdir(work, { recursive: true });
  await writeFile(path.join(work, "A001.JPG"), "jpg-1");
  await writeFile(path.join(work, "A002.JPG"), "jpg-2");
  await writeFile(path.join(work, "A003.ARW"), "raw");
  return { roots, work };
}

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("SSD2 PHOTO_CLASSIFY_WORK adapter", () => {
  it("keeps classification options instead of hardcoding AI naming", () => {
    expect(parseClassificationOptions({ ai_naming_enabled: false }).aiNamingEnabled).toBe(false);
    expect(parseClassificationOptions({ ai_naming_enabled: true }).aiNamingEnabled).toBe(true);
    expect(parseClassificationOptions({ gap_minutes: 3.5 }).gapMinutes).toBe(3.5);
  });

  it("reuses the existing runner while preserving RAW", async () => {
    const { roots, work } = await setup();
    const rawBefore = await stat(path.join(work, "A003.ARW"));
    const result = await runPhotoClassifyWork({
      roots,
      workRelativePath: "0914_test",
      shootingMode: "field",
      department: "dermatology",
      gapMinutes: 3.5,
      classificationUiMode: "ai-auto",
      fastAnalyzeMode: true,
      departmentLogicEnabled: false,
      aiNamingEnabled: false,
      qualityAnalysisEnabled: false,
      profileClassificationEnabled: false,
    });
    expect(result).toMatchObject({ ok: true, status: "CLASSIFY_COMPLETED", jpgCount: 2, sceneCount: 1 });
    await expect(readFile(path.join(work, "A003.ARW"), "utf8")).resolves.toBe("raw");
    const rawAfter = await stat(path.join(work, "A003.ARW"));
    expect(rawAfter.size).toBe(rawBefore.size);
    expect(await readdir(path.join(work, "JPG", "Scene01"))).toEqual(["A001.JPG", "A002.JPG"]);

    const recovered = await runPhotoClassifyWork({
      roots,
      workRelativePath: "0914_test",
      expectedJpgCount: 2,
      expectedJpgBytes: 10,
      shootingMode: "field",
      department: "dermatology",
      gapMinutes: 3.5,
      classificationUiMode: "ai-auto",
      fastAnalyzeMode: true,
      departmentLogicEnabled: false,
      aiNamingEnabled: false,
      qualityAnalysisEnabled: false,
      profileClassificationEnabled: false,
    });
    expect(recovered).toMatchObject({ ok: true, status: "CLASSIFY_COMPLETED", jpgCount: 2 });
  });

  it("rejects a work folder that already contains JPG output", async () => {
    const { roots, work } = await setup();
    await mkdir(path.join(work, "JPG", "Scene01"), { recursive: true });
    await writeFile(path.join(work, "JPG", "Scene01", "old.JPG"), "old");
    const result = await runPhotoClassifyWork({
      roots,
      workRelativePath: "0914_test",
      shootingMode: "field",
      department: "dermatology",
      gapMinutes: 3.5,
      classificationUiMode: "ai-auto",
      fastAnalyzeMode: true,
      departmentLogicEnabled: false,
      aiNamingEnabled: false,
      qualityAnalysisEnabled: false,
      profileClassificationEnabled: false,
    });
    expect(result).toMatchObject({ ok: false, status: "REVIEW_REQUIRED" });
  });
});
