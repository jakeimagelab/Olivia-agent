import { afterEach, describe, expect, it } from "vitest";
import { mkdir, mkdtemp, readFile, rm, stat, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { PhotoStorageWatcher, type PhotoWatcherState } from "@/lib/photo-classifier/node/photoWatcher";
import type { RunnerRoots } from "@/lib/photo-classifier/node/types";

const temporaryDirectories: string[] = [];

async function testRoots(): Promise<{ base: string; roots: RunnerRoots; statePath: string; lockPath: string }> {
  const base = await mkdtemp(path.join(os.tmpdir(), "olivia-photo-watcher-"));
  temporaryDirectories.push(base);
  const roots = { sourceRoot: path.join(base, "ssd1"), workRoot: path.join(base, "ssd2") };
  await Promise.all([mkdir(roots.sourceRoot), mkdir(roots.workRoot)]);
  return { base, roots, statePath: path.join(base, "watcher-state.json"), lockPath: path.join(base, "watcher.lock") };
}

async function readState(statePath: string): Promise<PhotoWatcherState> {
  return JSON.parse(await readFile(statePath, "utf8")) as PhotoWatcherState;
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("SSD1 photo watcher", () => {
  it("baselines existing projects and detects a new project", async () => {
    const { roots, statePath, lockPath } = await testRoots();
    const existing = path.join(roots.sourceRoot, "0913_existing");
    await mkdir(existing);
    await writeFile(path.join(existing, "A001.JPG"), "existing");
    const watcher = new PhotoStorageWatcher({ roots, statePath, lockPath, stableSeconds: 1, logger: () => undefined });
    const baseline = await watcher.scanOnce();
    expect(baseline.baselineInitialized).toBe(true);
    expect((await readState(statePath)).projects["0913_existing"].status).toBe("SEEN_EXISTING");

    await mkdir(path.join(roots.sourceRoot, "0914_new"));
    const detected = await watcher.scanOnce();
    expect(detected.sourceStatus).toBe("ONLINE");
    expect((await readState(statePath)).projects["0914_new"].status).toBe("DETECTED");
  });

  it("keeps stabilizing while the fingerprint changes", async () => {
    const { roots, statePath, lockPath } = await testRoots();
    const project = path.join(roots.sourceRoot, "shoot");
    await mkdir(project);
    await writeFile(path.join(project, "A001.JPG"), "one");
    const watcher = new PhotoStorageWatcher({ roots, statePath, lockPath, stableSeconds: 10, logger: () => undefined });
    await watcher.scanOnce();
    await mkdir(path.join(roots.sourceRoot, "new-shoot"));
    await watcher.scanOnce();
    await writeFile(path.join(roots.sourceRoot, "new-shoot", "A001.ARW"), "raw");
    await watcher.scanOnce();
    const state = await readState(statePath);
    expect(state.projects["new-shoot"].status).toBe("STABILIZING");
  });

  it("records a baseline project change without preparing it", async () => {
    const { roots, statePath, lockPath } = await testRoots();
    const project = path.join(roots.sourceRoot, "old-shoot");
    await mkdir(project);
    await writeFile(path.join(project, "A001.JPG"), "one");
    const watcher = new PhotoStorageWatcher({ roots, statePath, lockPath, stableSeconds: 1, logger: () => undefined });
    await watcher.scanOnce();
    await writeFile(path.join(project, "A002.JPG"), "two");
    const result = await watcher.scanOnce();
    expect(result.changedProjects).toEqual(["old-shoot"]);
    expect((await readState(statePath)).projects["old-shoot"].status).toBe("CHANGED_EXISTING");
    await expect(readFile(path.join(project, "A001.JPG"), "utf8")).resolves.toBe("one");
  });

  it("reports a new project READY after stable duration without mutating SSD1", async () => {
    const { roots, statePath, lockPath } = await testRoots();
    const baselineWatcher = new PhotoStorageWatcher({ roots, statePath, lockPath, stableSeconds: 1, logger: () => undefined });
    await baselineWatcher.scanOnce();
    const project = path.join(roots.sourceRoot, "0914_OO클리닉");
    await mkdir(project);
    await writeFile(path.join(project, "A001.ARW"), "raw");
    await writeFile(path.join(project, "A001.JPG"), "jpg");
    let current = new Date("2026-09-14T00:00:00.000Z");
    const watcher = new PhotoStorageWatcher({ roots, statePath, lockPath, stableSeconds: 1, now: () => current, logger: () => undefined });
    await watcher.scanOnce();
    await watcher.scanOnce();
    current = new Date(current.getTime() + 1001);
    const result = await watcher.scanOnce();
    expect(result.readyProjects).toEqual(["0914_OO클리닉"]);
    expect((await readState(statePath)).projects["0914_OO클리닉"].status).toBe("READY");
    await expect(readFile(path.join(project, "A001.ARW"), "utf8")).resolves.toBe("raw");
    await expect(readFile(path.join(project, "A001.JPG"), "utf8")).resolves.toBe("jpg");
    await expect(stat(path.join(project, "JPG전체"))).rejects.toThrow();
  });

  it("restarts stabilization when a fingerprint changes", async () => {
    const { roots, statePath, lockPath } = await testRoots();
    const baselineWatcher = new PhotoStorageWatcher({ roots, statePath, lockPath, stableSeconds: 1, logger: () => undefined });
    await baselineWatcher.scanOnce();
    const project = path.join(roots.sourceRoot, "race");
    await mkdir(project);
    await writeFile(path.join(project, "A001.ARW"), "raw");
    await writeFile(path.join(project, "A001.JPG"), "jpg");
    let current = new Date("2026-09-14T00:00:00.000Z");
    const watcher = new PhotoStorageWatcher({
      roots, statePath, lockPath, stableSeconds: 1, now: () => current, logger: () => undefined,
    });
    await watcher.scanOnce();
    await watcher.scanOnce();
    await writeFile(path.join(project, "A002.JPG"), "new");
    current = new Date(current.getTime() + 1001);
    const result = await watcher.scanOnce();
    expect(result.readyProjects).toEqual([]);
    expect((await readState(statePath)).projects.race.status).toBe("STABILIZING");
    current = new Date(current.getTime() + 1001);
    expect((await watcher.scanOnce()).readyProjects).toEqual(["race"]);
  });

  it("does not inspect or mutate JPG merge conflicts", async () => {
    const { roots, statePath, lockPath } = await testRoots();
    const baselineWatcher = new PhotoStorageWatcher({ roots, statePath, lockPath, stableSeconds: 1, logger: () => undefined });
    await baselineWatcher.scanOnce();
    const project = path.join(roots.sourceRoot, "conflict");
    await mkdir(path.join(project, "JPG전체"), { recursive: true });
    await writeFile(path.join(project, "A001.JPG"), "source");
    await writeFile(path.join(project, "JPG전체", "A001.JPG"), "existing");
    let current = new Date("2026-09-14T00:00:00.000Z");
    const watcher = new PhotoStorageWatcher({ roots, statePath, lockPath, stableSeconds: 1, now: () => current, logger: () => undefined });
    await watcher.scanOnce();
    await watcher.scanOnce();
    current = new Date(current.getTime() + 1001);
    expect((await watcher.scanOnce()).readyProjects).toEqual(["conflict"]);
    await expect(readFile(path.join(project, "A001.JPG"), "utf8")).resolves.toBe("source");
    await expect(readFile(path.join(project, "JPG전체", "A001.JPG"), "utf8")).resolves.toBe("existing");
  });

  it("reports READY once and keeps a failed server sync pending", async () => {
    const { roots, statePath, lockPath } = await testRoots();
    const baselineWatcher = new PhotoStorageWatcher({ roots, statePath, lockPath, stableSeconds: 1, logger: () => undefined });
    await baselineWatcher.scanOnce();
    const project = path.join(roots.sourceRoot, "report-me");
    await mkdir(project);
    await writeFile(path.join(project, "A001.ARW"), "raw");
    await writeFile(path.join(project, "A001.JPG"), "jpg");
    let current = new Date("2026-09-14T00:00:00.000Z");
    let attempts = 0;
    const watcher = new PhotoStorageWatcher({
      roots, statePath, lockPath, stableSeconds: 1, now: () => current, logger: () => undefined,
      reportReady: async (report) => { attempts += 1; expect(report.sourceRelativePath).toBe("report-me"); expect(report.status).toBe("READY"); if (attempts === 1) throw new Error("offline"); },
    });
    await watcher.scanOnce();
    await watcher.scanOnce();
    current = new Date(current.getTime() + 1001);
    await watcher.scanOnce();
    expect(attempts).toBe(1);
    expect((await readState(statePath)).projects["report-me"].serverSyncStatus).toBe("PENDING");
    await watcher.scanOnce();
    expect(attempts).toBe(2);
    expect((await readState(statePath)).projects["report-me"].serverSyncStatus).toBe("SYNCED");
  });

  it("reports SOURCE_OFFLINE without changing project state", async () => {
    const { roots, statePath, lockPath } = await testRoots();
    const project = path.join(roots.sourceRoot, "existing");
    await mkdir(project);
    await writeFile(path.join(project, "A001.JPG"), "jpg");
    const watcher = new PhotoStorageWatcher({ roots, statePath, lockPath, logger: () => undefined });
    await watcher.scanOnce();
    await rm(roots.sourceRoot, { recursive: true, force: true });
    const result = await watcher.scanOnce();
    expect(result.sourceStatus).toBe("SOURCE_OFFLINE");
    const state = await readState(statePath);
    expect(state.sourceStatus).toBe("SOURCE_OFFLINE");
    expect(state.projects.existing.status).toBe("SEEN_EXISTING");
  });

  it("does not prepare baseline projects and restores state on restart", async () => {
    const { roots, statePath, lockPath } = await testRoots();
    const project = path.join(roots.sourceRoot, "old");
    await mkdir(project);
    await writeFile(path.join(project, "A001.JPG"), "jpg");
    const first = new PhotoStorageWatcher({ roots, statePath, lockPath, stableSeconds: 1, logger: () => undefined });
    await first.scanOnce();
    expect((await readState(statePath)).projects.old.status).toBe("SEEN_EXISTING");
    const restarted = new PhotoStorageWatcher({ roots, statePath, lockPath, stableSeconds: 1, logger: () => undefined });
    expect((await restarted.scanOnce()).readyProjects).toEqual([]);
    expect((await readState(statePath)).projects.old.status).toBe("SEEN_EXISTING");
  });

  it("blocks a second watcher with the same lock", async () => {
    const { roots, statePath, lockPath } = await testRoots();
    const first = new PhotoStorageWatcher({ roots, statePath, lockPath, intervalSeconds: 60, logger: () => undefined });
    await first.start();
    const second = new PhotoStorageWatcher({ roots, statePath, lockPath, logger: () => undefined });
    await expect(second.start({ once: true })).rejects.toThrow(/이미 실행 중/);
    await first.stop();
  });

  it("marks a project symlink as ERROR instead of following it", async () => {
    const { base, roots, statePath, lockPath } = await testRoots();
    const outside = path.join(base, "outside");
    await mkdir(outside);
    await symlink(outside, path.join(roots.sourceRoot, "linked"));
    const watcher = new PhotoStorageWatcher({ roots, statePath, lockPath, logger: () => undefined });
    const result = await watcher.scanOnce();
    expect(result.errors).toEqual(["linked"]);
    expect((await readState(statePath)).projects.linked.status).toBe("ERROR");
  });
});
