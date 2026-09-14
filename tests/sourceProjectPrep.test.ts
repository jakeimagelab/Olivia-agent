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
  it("moves only root JPG files into JPG원본 and leaves RAW in place", async () => {
    const { roots } = await testRoots();
    const project = path.join(roots.sourceRoot, "0914_OO클리닉");
    await mkdir(project);
    await writeFile(path.join(project, "A001.ARW"), "raw-1");
    await writeFile(path.join(project, "A002.CR3"), "raw-2");
    await writeFile(path.join(project, "A001.JPG"), "jpg-1");
    await writeFile(path.join(project, "A002.jpeg"), "jpg-2");
    await writeFile(path.join(project, "notes.txt"), "keep");

    const result = await preparePrimaryPhotoProject("0914_OO클리닉", { roots });
    expect(result).toMatchObject({ projectPath: "0914_OO클리닉", jpgMoved: 2, jpgAlreadyPrepared: 0, rawUntouched: 2, status: "READY" });
    await expect(readFile(path.join(project, "A001.ARW"), "utf8")).resolves.toBe("raw-1");
    await expect(readFile(path.join(project, "A002.CR3"), "utf8")).resolves.toBe("raw-2");
    await expect(readFile(path.join(project, "JPG원본", "A001.JPG"), "utf8")).resolves.toBe("jpg-1");
    await expect(readFile(path.join(project, "JPG원본", "A002.jpeg"), "utf8")).resolves.toBe("jpg-2");
    await expect(readFile(path.join(project, "notes.txt"), "utf8")).resolves.toBe("keep");
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

  it("is idempotent and moves only newly arrived JPG files", async () => {
    const { roots } = await testRoots();
    const project = path.join(roots.sourceRoot, "shoot");
    await mkdir(project);
    await writeFile(path.join(project, "A001.ARW"), "raw");
    await writeFile(path.join(project, "A001.JPG"), "one");

    await expect(preparePrimaryPhotoProject("shoot", { roots })).resolves.toMatchObject({ jpgMoved: 1 });
    await writeFile(path.join(project, "A002.JPG"), "two");
    const second = await preparePrimaryPhotoProject("shoot", { roots });
    expect(second).toMatchObject({ jpgMoved: 1, jpgAlreadyPrepared: 1, rawUntouched: 1, status: "READY" });
    expect(await readdir(path.join(project, "JPG원본"))).toEqual(expect.arrayContaining(["A001.JPG", "A002.JPG"]));
  });

  it("does not overwrite an existing destination and requests review", async () => {
    const { roots } = await testRoots();
    const project = path.join(roots.sourceRoot, "shoot");
    await mkdir(path.join(project, "JPG원본"), { recursive: true });
    await writeFile(path.join(project, "A001.JPG"), "source-version");
    await writeFile(path.join(project, "JPG원본", "A001.JPG"), "prepared-version");

    const result = await preparePrimaryPhotoProject("shoot", { roots });
    expect(result).toMatchObject({ jpgMoved: 0, status: "REVIEW_REQUIRED" });
    expect(result.conflicts).toHaveLength(1);
    await expect(readFile(path.join(project, "A001.JPG"), "utf8")).resolves.toBe("source-version");
    await expect(readFile(path.join(project, "JPG원본", "A001.JPG"), "utf8")).resolves.toBe("prepared-version");
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
    await mkdir(path.join(project, "JPG원본"), { recursive: true });
    await writeFile(path.join(project, "A001.ARW"), "raw");
    await expect(assertSafeSourceJpgRelocation({
      sourceRoot: roots.sourceRoot,
      projectRoot: project,
      source: path.join(project, "A001.ARW"),
      destination: path.join(project, "JPG원본", "A001.ARW"),
    })).rejects.toThrow(/JPG\/JPEG/);
    await writeFile(path.join(project, "A001.JPG"), "jpg");
    await expect(assertSafeSourceJpgRelocation({
      sourceRoot: roots.sourceRoot,
      projectRoot: project,
      source: path.join(project, "A001.JPG"),
      destination: path.join(project, "Scene01", "A001.JPG"),
    })).rejects.toThrow(/JPG원본/);
  });
});
