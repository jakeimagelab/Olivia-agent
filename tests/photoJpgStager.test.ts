import { afterEach, describe, expect, it } from "vitest";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { stageProjectJpgToWorkStorage } from "@/lib/photo-classifier/node/photoJpgStager";

const tempRoots: string[] = [];

async function setup() {
  const base = await mkdtemp(path.join(os.tmpdir(), "olivia-photo-stage-"));
  tempRoots.push(base);
  const roots = { sourceRoot: path.join(base, "ssd1"), workRoot: path.join(base, "ssd2") };
  const project = path.join(roots.sourceRoot, "0914_test", "JPG원본");
  await mkdir(project, { recursive: true });
  await mkdir(roots.workRoot);
  return { roots, project, destination: path.join(roots.workRoot, "0914_test") };
}

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("SSD1 JPG원본 → SSD2 staging", () => {
  it("copies JPG only and leaves the source unchanged", async () => {
    const { roots, project, destination } = await setup();
    await writeFile(path.join(project, "A001.JPG"), "jpg-1");
    await writeFile(path.join(project, "A002.jpeg"), "jpg-22");
    await writeFile(path.join(project, "A003.ARW"), "raw");
    const rawBefore = await stat(path.join(project, "A003.ARW"));
    const result = await stageProjectJpgToWorkStorage({ roots, sourceRelativePath: "0914_test", minFreeBytes: 0 });
    expect(result).toMatchObject({ ok: true, status: "COPY_COMPLETED", sourceCount: 2, sourceBytes: 11, copiedCount: 2 });
    await expect(readFile(path.join(project, "A003.ARW"), "utf8")).resolves.toBe("raw");
    const rawAfter = await stat(path.join(project, "A003.ARW"));
    expect(rawAfter.size).toBe(rawBefore.size);
    expect(rawAfter.mtimeMs).toBe(rawBefore.mtimeMs);
    await expect(readFile(path.join(destination, "A001.JPG"), "utf8")).resolves.toBe("jpg-1");
    await expect(readFile(path.join(destination, "A002.jpeg"), "utf8")).resolves.toBe("jpg-22");
  });

  it("is idempotent when the destination already matches", async () => {
    const { roots, project } = await setup();
    await writeFile(path.join(project, "A001.JPG"), "jpg");
    const first = await stageProjectJpgToWorkStorage({ roots, sourceRelativePath: "0914_test", minFreeBytes: 0 });
    const second = await stageProjectJpgToWorkStorage({ roots, sourceRelativePath: "0914_test", minFreeBytes: 0 });
    expect(first.ok).toBe(true);
    expect(second).toMatchObject({ ok: true, status: "COPY_COMPLETED", copiedCount: 0, skippedCount: 1 });
  });

  it("does not overwrite a conflicting destination file", async () => {
    const { roots, project, destination } = await setup();
    await writeFile(path.join(project, "A001.JPG"), "source");
    await mkdir(destination, { recursive: true });
    await writeFile(path.join(destination, "A001.JPG"), "different-size");
    const result = await stageProjectJpgToWorkStorage({ roots, sourceRelativePath: "0914_test", minFreeBytes: 0 });
    expect(result).toMatchObject({ ok: false, status: "REVIEW_REQUIRED" });
    await expect(readFile(path.join(destination, "A001.JPG"), "utf8")).resolves.toBe("different-size");
  });

  it("refuses to start when there is not enough SSD2 space", async () => {
    const { roots, project, destination } = await setup();
    await writeFile(path.join(project, "A001.JPG"), "jpg");
    const result = await stageProjectJpgToWorkStorage({ roots, sourceRelativePath: "0914_test", minFreeBytes: Number.MAX_SAFE_INTEGER });
    expect(result).toMatchObject({ ok: false, status: "COPY_FAILED", copiedCount: 0 });
    await expect(stat(destination)).rejects.toThrow();
  });
});

