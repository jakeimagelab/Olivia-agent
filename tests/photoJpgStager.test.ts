import { afterEach, describe, expect, it } from "vitest";
import { mkdir, mkdtemp, readFile, readdir, rm, stat, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { stageProjectJpgToWorkStorage } from "@/lib/photo-classifier/node/photoJpgStager";

const tempRoots: string[] = [];

async function setup() {
  const base = await mkdtemp(path.join(os.tmpdir(), "olivia-photo-copy-"));
  tempRoots.push(base);
  const roots = { sourceRoot: path.join(base, "ssd1"), workRoot: path.join(base, "ssd2") };
  const project = path.join(roots.sourceRoot, "0914_test");
  const sourceJpg = path.join(project, "JPG전체");
  await mkdir(sourceJpg, { recursive: true });
  await mkdir(roots.workRoot);
  return { roots, project, sourceJpg, destination: path.join(roots.workRoot, "0914_test", "JPG전체") };
}

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("SSD1 JPG전체 → SSD2 Agentstation COPY", () => {
  it("copies JPG only into the matching JPG전체 folder and leaves SSD1 unchanged", async () => {
    const { roots, project, sourceJpg, destination } = await setup();
    await writeFile(path.join(sourceJpg, "A001.JPG"), "jpg-1");
    await writeFile(path.join(sourceJpg, "A002.jpeg"), "jpg-22");
    await writeFile(path.join(project, "A003.ARW"), "raw");
    const jpgBefore = await stat(path.join(sourceJpg, "A001.JPG"));
    const rawBefore = await stat(path.join(project, "A003.ARW"));
    const result = await stageProjectJpgToWorkStorage({ roots, sourceRelativePath: "0914_test", minFreeBytes: 0 });
    expect(result).toMatchObject({ ok: true, status: "COPY_COMPLETED", sourceCount: 2, sourceBytes: 11, destinationJpgCount: 2, copiedCount: 2, rawCopiedCount: 0 });
    await expect(readFile(path.join(destination, "A001.JPG"), "utf8")).resolves.toBe("jpg-1");
    await expect(readFile(path.join(destination, "A002.jpeg"), "utf8")).resolves.toBe("jpg-22");
    const jpgAfter = await stat(path.join(sourceJpg, "A001.JPG"));
    const copiedJpg = await stat(path.join(destination, "A001.JPG"));
    expect(jpgAfter.mtimeMs).toBe(jpgBefore.mtimeMs);
    expect(Math.abs(copiedJpg.mtimeMs - jpgBefore.mtimeMs)).toBeLessThan(1);
    const rawAfter = await stat(path.join(project, "A003.ARW"));
    expect(rawAfter.size).toBe(rawBefore.size);
    expect(rawAfter.mtimeMs).toBe(rawBefore.mtimeMs);
    expect(await readdir(project)).toEqual(expect.arrayContaining(["JPG전체", "A003.ARW"]));
  });

  it("preserves nested JPG paths and byte-level metadata payloads", async () => {
    const { roots, sourceJpg, destination } = await setup();
    const metadataJpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe1, 0x00, 0x1a, ...Buffer.from("Exif\\0\\0DateTimeOriginal=2026:09:15 10:20:30"), 0xff, 0xd9]);
    await mkdir(path.join(sourceJpg, "A"));
    await writeFile(path.join(sourceJpg, "A", "META.JPG"), metadataJpeg);
    const result = await stageProjectJpgToWorkStorage({ roots, sourceRelativePath: "0914_test", minFreeBytes: 0 });
    expect(result.ok).toBe(true);
    await expect(readFile(path.join(destination, "A", "META.JPG"))).resolves.toEqual(metadataJpeg);
  });

  it("resumes a partial destination without overwriting existing files", async () => {
    const { roots, sourceJpg, destination } = await setup();
    await writeFile(path.join(sourceJpg, "A001.JPG"), "one");
    await writeFile(path.join(sourceJpg, "A002.JPG"), "two");
    await mkdir(destination, { recursive: true });
    await writeFile(path.join(destination, "A001.JPG"), "one");
    const result = await stageProjectJpgToWorkStorage({ roots, sourceRelativePath: "0914_test", minFreeBytes: 0 });
    expect(result).toMatchObject({ ok: true, copiedCount: 1, alreadyCopiedCount: 1, destinationJpgCount: 2 });
    await expect(readFile(path.join(destination, "A002.JPG"), "utf8")).resolves.toBe("two");
  });

  it("requires SHA-256 equality before reusing an existing same-size file", async () => {
    const { roots, sourceJpg, destination } = await setup();
    await writeFile(path.join(sourceJpg, "A001.JPG"), "abc");
    await mkdir(destination, { recursive: true });
    await writeFile(path.join(destination, "A001.JPG"), "xyz");
    const result = await stageProjectJpgToWorkStorage({ roots, sourceRelativePath: "0914_test", minFreeBytes: 0 });
    expect(result).toMatchObject({ ok: false, status: "REVIEW_REQUIRED", copiedCount: 0 });
    await expect(readFile(path.join(destination, "A001.JPG"), "utf8")).resolves.toBe("xyz");
  });

  it("recovers Olivia temp files and never overwrites a final filename", async () => {
    const { roots, sourceJpg, destination } = await setup();
    await writeFile(path.join(sourceJpg, "A001.JPG"), "source");
    await mkdir(destination, { recursive: true });
    await writeFile(path.join(destination, ".A001.JPG.olivia-part"), "partial");
    const result = await stageProjectJpgToWorkStorage({ roots, sourceRelativePath: "0914_test", minFreeBytes: 0 });
    expect(result.ok).toBe(true);
    await expect(readFile(path.join(destination, "A001.JPG"), "utf8")).resolves.toBe("source");
    await expect(stat(path.join(destination, ".A001.JPG.olivia-part"))).rejects.toThrow();
  });

  it("stops before copying when a RAW or symlink is present in JPG전체", async () => {
    const first = await setup();
    await writeFile(path.join(first.sourceJpg, "bad.ARW"), "raw");
    await writeFile(path.join(first.sourceJpg, "A001.JPG"), "jpg");
    const rawResult = await stageProjectJpgToWorkStorage({ roots: first.roots, sourceRelativePath: "0914_test", minFreeBytes: 0 });
    expect(rawResult).toMatchObject({ ok: false, status: "REVIEW_REQUIRED", copiedCount: 0 });

    const second = await setup();
    await writeFile(path.join(second.sourceJpg, "A001.JPG"), "jpg");
    await symlink(path.join(second.sourceJpg, "A001.JPG"), path.join(second.sourceJpg, "link.JPG"));
    const linkResult = await stageProjectJpgToWorkStorage({ roots: second.roots, sourceRelativePath: "0914_test", minFreeBytes: 0 });
    expect(linkResult).toMatchObject({ ok: false, status: "REVIEW_REQUIRED", copiedCount: 0 });
  });

  it("does not start when destination free space is insufficient", async () => {
    const { roots, sourceJpg, destination } = await setup();
    await writeFile(path.join(sourceJpg, "A001.JPG"), "jpg");
    const result = await stageProjectJpgToWorkStorage({ roots, sourceRelativePath: "0914_test", minFreeBytes: Number.MAX_SAFE_INTEGER });
    expect(result).toMatchObject({ ok: false, status: "COPY_FAILED", copiedCount: 0 });
    await expect(stat(destination)).rejects.toThrow();
  });

  it("rejects traversal and absolute paths before touching either storage", async () => {
    const { roots } = await setup();
    await expect(stageProjectJpgToWorkStorage({ roots, sourceRelativePath: "../0914_test", minFreeBytes: 0 })).rejects.toThrow();
    await expect(stageProjectJpgToWorkStorage({ roots, sourceRelativePath: path.join(roots.sourceRoot, "0914_test"), minFreeBytes: 0 })).rejects.toThrow();
  });

  it("is idempotent after COPY_COMPLETED", async () => {
    const { roots, sourceJpg } = await setup();
    await writeFile(path.join(sourceJpg, "A001.JPG"), "jpg");
    const first = await stageProjectJpgToWorkStorage({ roots, sourceRelativePath: "0914_test", minFreeBytes: 0 });
    const second = await stageProjectJpgToWorkStorage({ roots, sourceRelativePath: "0914_test", minFreeBytes: 0 });
    expect(first.ok).toBe(true);
    expect(second).toMatchObject({ ok: true, status: "COPY_COMPLETED", copiedCount: 0, alreadyCopiedCount: 1, rawCopiedCount: 0 });
  });
});
