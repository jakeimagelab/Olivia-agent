import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, mkdir, readFile, readdir, rm, stat, symlink, utimes, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  assertSafeSourceJpgRelocation,
  preparePrimaryPhotoProject,
} from "@/lib/photo-classifier/node/sourceProjectPrep";
import type { RunnerRoots } from "@/lib/photo-classifier/node/types";

const temporaryDirectories: string[] = [];

async function testRoots(): Promise<{ base: string; roots: RunnerRoots }> {
  const base = await mkdtemp(path.join(os.tmpdir(), "olivia-source-prep-"));
  temporaryDirectories.push(base);
  const roots = { sourceRoot: path.join(base, "ssd1"), workRoot: path.join(base, "ssd2") };
  await Promise.all([mkdir(roots.sourceRoot), mkdir(roots.workRoot)]);
  return { base, roots };
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("SSD1 primary JPG preparation", () => {
  it("moves JPG files (including nested folders) into JPG전체 and leaves RAW in place", async () => {
    const { roots } = await testRoots();
    const project = path.join(roots.sourceRoot, "0914_OO클리닉");
    await mkdir(project);
    await writeFile(path.join(project, "A001.ARW"), "raw-1");
    await writeFile(path.join(project, "A002.CR3"), "raw-2");
    await writeFile(path.join(project, "A001.JPG"), "jpg-1");
    await writeFile(path.join(project, "A002.jpeg"), "jpg-2");
    await writeFile(path.join(project, "notes.txt"), "keep");

    const progress: Array<{ current?: number; total?: number; message: string }> = [];
    const result = await preparePrimaryPhotoProject("0914_OO클리닉", {
      roots,
      onProgress: (entry) => progress.push(entry),
    });
    expect(result).toMatchObject({ projectPath: "0914_OO클리닉", jpgMoved: 2, jpgAlreadyPrepared: 0, rawUntouched: 2, status: "JPG_MERGE_COMPLETED" });
    expect(progress.map(({ current, total }) => ({ current, total }))).toEqual([
      { current: 0, total: 2 },
      { current: 1, total: 2 },
      { current: 2, total: 2 },
    ]);
    await expect(readFile(path.join(project, "A001.ARW"), "utf8")).resolves.toBe("raw-1");
    await expect(readFile(path.join(project, "A002.CR3"), "utf8")).resolves.toBe("raw-2");
    await expect(readFile(path.join(project, "JPG전체", "A001.JPG"), "utf8")).resolves.toBe("jpg-1");
    await expect(readFile(path.join(project, "JPG전체", "A002.jpeg"), "utf8")).resolves.toBe("jpg-2");
    await expect(readFile(path.join(project, "notes.txt"), "utf8")).resolves.toBe("keep");
  });

  it("flattens nested JPG files into JPG전체 while preserving nested RAW", async () => {
    const { roots } = await testRoots();
    const project = path.join(roots.sourceRoot, "nested");
    await mkdir(path.join(project, "A"), { recursive: true });
    await mkdir(path.join(project, "B"), { recursive: true });
    await writeFile(path.join(project, "A", "DSC001.ARW"), "raw-a");
    await writeFile(path.join(project, "A", "DSC001.JPG"), "jpg-a");
    await writeFile(path.join(project, "B", "DSC002.JPG"), "jpg-b");
    const result = await preparePrimaryPhotoProject("nested", { roots });
    expect(result).toMatchObject({ jpgMoved: 2, status: "JPG_MERGE_COMPLETED" });
    expect(await readdir(path.join(project, "JPG전체"))).toEqual(expect.arrayContaining(["DSC001.JPG", "DSC002.JPG"]));
    await expect(readFile(path.join(project, "A", "DSC001.ARW"), "utf8")).resolves.toBe("raw-a");
  });

  it("preflights duplicate basenames before creating JPG전체 or moving a file", async () => {
    const { roots } = await testRoots();
    const project = path.join(roots.sourceRoot, "duplicates");
    await mkdir(path.join(project, "A"), { recursive: true });
    await mkdir(path.join(project, "B"), { recursive: true });
    await writeFile(path.join(project, "A", "same.JPG"), "one");
    await writeFile(path.join(project, "B", "same.JPG"), "two");
    const result = await preparePrimaryPhotoProject("duplicates", { roots });
    expect(result.status).toBe("REVIEW_REQUIRED");
    expect(result.conflicts[0]?.reason).toBe("duplicate_filename");
    await expect(stat(path.join(project, "JPG전체"))).rejects.toThrow();
    await expect(readFile(path.join(project, "A", "same.JPG"), "utf8")).resolves.toBe("one");
    await expect(readFile(path.join(project, "B", "same.JPG"), "utf8")).resolves.toBe("two");
  });

  it("preserves RAW filename, size, and mtime", async () => {
    const { roots } = await testRoots();
    const project = path.join(roots.sourceRoot, "shoot");
    await mkdir(project);
    const raw = path.join(project, "A001.ARW");
    await writeFile(raw, "raw-content");
    const fixedTime = new Date("2026-09-14T00:00:00.000Z");
    await utimes(raw, fixedTime, fixedTime);
    await writeFile(path.join(project, "A001.JPG"), "jpg-content");
    const before = await stat(raw);

    await preparePrimaryPhotoProject("shoot", { roots });
    const after = await stat(raw);
    expect({ size: after.size, mtimeMs: after.mtimeMs }).toEqual({ size: before.size, mtimeMs: before.mtimeMs });
  });

  it("moves JPG by rename without changing its filesystem metadata", async () => {
    const { roots } = await testRoots();
    const project = path.join(roots.sourceRoot, "jpg-metadata");
    await mkdir(project);
    const jpg = path.join(project, "A001.JPG");
    await writeFile(jpg, "jpeg-payload");
    const fixedTime = new Date("2026-09-14T00:00:00.000Z");
    await utimes(jpg, fixedTime, fixedTime);
    const before = await stat(jpg);
    await preparePrimaryPhotoProject("jpg-metadata", { roots });
    const after = await stat(path.join(project, "JPG전체", "A001.JPG"));
    expect({ size: after.size, mtimeMs: after.mtimeMs }).toEqual({ size: before.size, mtimeMs: before.mtimeMs });
  });

  it("is idempotent and moves only newly arrived JPG files", async () => {
    const { roots } = await testRoots();
    const project = path.join(roots.sourceRoot, "shoot");
    await mkdir(project);
    await writeFile(path.join(project, "A001.ARW"), "raw");
    await writeFile(path.join(project, "A001.JPG"), "one");

    await expect(preparePrimaryPhotoProject("shoot", { roots })).resolves.toMatchObject({ jpgMoved: 1 });
    await writeFile(path.join(project, "A002.JPG"), "two");
    const second = await preparePrimaryPhotoProject("shoot", { roots });
    expect(second).toMatchObject({ jpgMoved: 1, jpgAlreadyPrepared: 1, rawUntouched: 1, status: "JPG_MERGE_COMPLETED" });
    expect(await readdir(path.join(project, "JPG전체"))).toEqual(expect.arrayContaining(["A001.JPG", "A002.JPG"]));
  });

  it("recognizes an existing decomposed-Unicode JPG전체 directory", async () => {
    const { roots } = await testRoots();
    const project = path.join(roots.sourceRoot, "unicode-directory");
    const decomposedDirectoryName = "JPG전체".normalize("NFD");
    await mkdir(path.join(project, decomposedDirectoryName), { recursive: true });
    await writeFile(path.join(project, decomposedDirectoryName, "A001.JPG"), "prepared");
    await writeFile(path.join(project, "A002.JPG"), "new");

    const result = await preparePrimaryPhotoProject("unicode-directory", { roots });

    expect(result).toMatchObject({
      jpgMoved: 1,
      jpgAlreadyPrepared: 1,
      status: "JPG_MERGE_COMPLETED",
    });
    expect((await readdir(project)).filter((name) => name.normalize("NFC") === "JPG전체")).toHaveLength(1);
    await expect(readFile(path.join(project, decomposedDirectoryName, "A001.JPG"), "utf8")).resolves.toBe("prepared");
    await expect(readFile(path.join(project, decomposedDirectoryName, "A002.JPG"), "utf8")).resolves.toBe("new");
  });

  it("does not overwrite an existing destination and requests review", async () => {
    const { roots } = await testRoots();
    const project = path.join(roots.sourceRoot, "shoot");
    await mkdir(path.join(project, "JPG전체"), { recursive: true });
    await writeFile(path.join(project, "A001.JPG"), "source-version");
    await writeFile(path.join(project, "JPG전체", "A001.JPG"), "prepared-version");

    const result = await preparePrimaryPhotoProject("shoot", { roots });
    expect(result).toMatchObject({ jpgMoved: 0, status: "REVIEW_REQUIRED" });
    expect(result.conflicts).toHaveLength(1);
    await expect(readFile(path.join(project, "A001.JPG"), "utf8")).resolves.toBe("source-version");
    await expect(readFile(path.join(project, "JPG전체", "A001.JPG"), "utf8")).resolves.toBe("prepared-version");
  });

  it("rejects traversal, absolute paths, the source root, and a symlink project", async () => {
    const { base, roots } = await testRoots();
    await expect(preparePrimaryPhotoProject("", { roots })).rejects.toThrow(/project 경로/);
    await expect(preparePrimaryPhotoProject("../outside", { roots })).rejects.toThrow(/상대경로|올바르지 않습니다/);
    await expect(preparePrimaryPhotoProject(path.join(roots.sourceRoot, "shoot"), { roots })).rejects.toThrow(/상대경로/);
    const outside = path.join(base, "outside");
    await mkdir(outside);
    await symlink(outside, path.join(roots.sourceRoot, "linked-project"));
    await expect(preparePrimaryPhotoProject("linked-project", { roots })).rejects.toThrow(/심볼릭 링크/);
  });

  it("rejects RAW and non-JPG relocation targets", async () => {
    const { roots } = await testRoots();
    const project = path.join(roots.sourceRoot, "shoot");
    await mkdir(path.join(project, "JPG전체"), { recursive: true });
    await writeFile(path.join(project, "A001.ARW"), "raw");
    await expect(assertSafeSourceJpgRelocation({
      sourceRoot: roots.sourceRoot,
      projectRoot: project,
      source: path.join(project, "A001.ARW"),
      destination: path.join(project, "JPG전체", "A001.ARW"),
    })).rejects.toThrow(/JPG\/JPEG/);
    await writeFile(path.join(project, "A001.JPG"), "jpg");
    await expect(assertSafeSourceJpgRelocation({
      sourceRoot: roots.sourceRoot,
      projectRoot: project,
      source: path.join(project, "A001.JPG"),
      destination: path.join(project, "Scene01", "A001.JPG"),
    })).rejects.toThrow(/JPG전체/);
  });
});
