import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, mkdir, readFile, rm, stat, symlink, utimes, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import {
  normalizeSourceFolder,
  prepareRemotePhotoWorkFolder,
} from "@/lib/photo-classifier/node/pathSafety";
import { extractNodeVisualFeatures } from "@/lib/photo-classifier/node/imageAdapter";
import { runRemotePhotoSortRunner } from "@/lib/photo-classifier/node/remotePhotoSortRunner";
import type { RunnerRoots } from "@/lib/photo-classifier/node/types";

const temporaryDirectories: string[] = [];

async function testRoots(): Promise<{ base: string; roots: RunnerRoots }> {
  const base = await mkdtemp(path.join(os.tmpdir(), "olivia-photo-runner-"));
  temporaryDirectories.push(base);
  const sourceRoot = path.join(base, "source");
  const workRoot = path.join(base, "work");
  await Promise.all([mkdir(sourceRoot), mkdir(workRoot)]);
  return { base, roots: { sourceRoot, workRoot } };
}

async function jpg(filePath: string, color: string, modifiedAt: Date): Promise<void> {
  await sharp({
    create: {
      width: 80,
      height: 60,
      channels: 3,
      background: color,
    },
  }).jpeg().toFile(filePath);
  await utimes(filePath, modifiedAt, modifiedAt);
}

function runnerOptions() {
  return {
    shootingMode: "field" as const,
    department: "dermatology" as const,
    gapMinutes: 3.5,
    classificationUiMode: "advanced" as const,
    fastAnalyzeMode: true,
    departmentLogicEnabled: false,
    aiNamingEnabled: false,
    qualityAnalysisEnabled: false,
    profileClassificationEnabled: false,
  };
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("remote photo sort path safety", () => {
  it("rejects absolute, root, traversal, and ambiguous relative source paths", () => {
    expect(() => normalizeSourceFolder("/Volumes/anything")).toThrow(/상대경로/);
    expect(() => normalizeSourceFolder("")).toThrow(/촬영 폴더/);
    expect(() => normalizeSourceFolder("../outside")).toThrow(/촬영 폴더/);
    expect(() => normalizeSourceFolder("shoot//jpg")).toThrow(/촬영 폴더/);
    expect(normalizeSourceFolder("0913_BLS_GN2")).toBe("0913_BLS_GN2");
  });

  it("refuses an existing work destination without changing it", async () => {
    const { roots } = await testRoots();
    await mkdir(path.join(roots.sourceRoot, "shoot"));
    const existing = path.join(roots.workRoot, "shoot");
    await mkdir(existing);
    await writeFile(path.join(existing, "keep.txt"), "keep");

    await expect(prepareRemotePhotoWorkFolder({ sourceFolder: "shoot" }, roots)).rejects.toThrow(/이미 존재/);
    await expect(readFile(path.join(existing, "keep.txt"), "utf8")).resolves.toBe("keep");
  });

  it("rejects a symlink in a source tree instead of following it", async () => {
    const { base, roots } = await testRoots();
    const shoot = path.join(roots.sourceRoot, "shoot");
    await mkdir(shoot);
    const outside = path.join(base, "outside.txt");
    await writeFile(outside, "outside");
    await symlink(outside, path.join(shoot, "linked.txt"));

    await expect(prepareRemotePhotoWorkFolder({ sourceFolder: "shoot" }, roots)).rejects.toThrow(/심볼릭 링크/);
    await expect(readFile(outside, "utf8")).resolves.toBe("outside");
  });

  it("rejects an already processed work copy", async () => {
    const { roots } = await testRoots();
    const shoot = path.join(roots.workRoot, "shoot");
    await mkdir(shoot);
    await mkdir(path.join(shoot, "JPG"));

    await expect(prepareRemotePhotoWorkFolder({ workFolder: shoot }, roots)).rejects.toThrow(/덮어쓰지 않습니다/);
  });

  it("rejects a work folder outside WORK_ROOT, including a symlink escape", async () => {
    const { base, roots } = await testRoots();
    const outside = path.join(base, "outside-work");
    await mkdir(outside);
    await expect(prepareRemotePhotoWorkFolder({ workFolder: outside }, roots)).rejects.toThrow(/Root 밖/);

    const linked = path.join(roots.workRoot, "linked-work");
    await symlink(outside, linked);
    await expect(prepareRemotePhotoWorkFolder({ workFolder: linked }, roots)).rejects.toThrow(/Root 밖/);
  });
});

describe("remote photo sort runner", () => {
  it("extracts real visual features from a Node image through sharp", async () => {
    const { base } = await testRoots();
    const imagePath = path.join(base, "feature.jpg");
    await jpg(imagePath, "#155855", new Date());

    const features = await extractNodeVisualFeatures(imagePath);
    expect(features.dHash).toHaveLength(64);
    expect(features.colorHistogram).toHaveLength(64);
    expect(features.backgroundGrid).toHaveLength(24);
    expect(features.compositionGrid).toHaveLength(16);
    expect(features.brightness).toBeGreaterThan(0);
  });

  it("stages from a read-only source copy and organizes only the work tree", async () => {
    const { roots } = await testRoots();
    const sourceShoot = path.join(roots.sourceRoot, "0913_BLS_GN2");
    await mkdir(sourceShoot);
    const firstTime = new Date("2026-09-13T10:00:00+09:00");
    const secondTime = new Date("2026-09-13T10:10:00+09:00");
    await jpg(path.join(sourceShoot, "A001.jpg"), "#155855", firstTime);
    await jpg(path.join(sourceShoot, "A002.jpg"), "#E85D2C", secondTime);
    await writeFile(path.join(sourceShoot, "A001.CR2"), "raw-one");

    const result = await runRemotePhotoSortRunner({
      ...runnerOptions(),
      sourceFolder: "0913_BLS_GN2",
    }, { roots });

    expect(result).toMatchObject({
      ok: true,
      status: "COMPLETED",
      sourceFolder: "0913_BLS_GN2",
      fileCount: 3,
      rawCount: 1,
      jpgCount: 2,
      sceneCount: 2,
    });
    await expect(stat(path.join(sourceShoot, "A001.jpg"))).resolves.toBeTruthy();
    await expect(stat(path.join(sourceShoot, "A002.jpg"))).resolves.toBeTruthy();
    await expect(stat(path.join(sourceShoot, "A001.CR2"))).resolves.toBeTruthy();

    const workShoot = path.join(roots.workRoot, "0913_BLS_GN2");
    await expect(stat(path.join(workShoot, "RAW", "A001.CR2"))).resolves.toBeTruthy();
    await expect(stat(path.join(workShoot, "JPG", "Scene01", "A001.jpg"))).resolves.toBeTruthy();
    await expect(stat(path.join(workShoot, "JPG", "Scene02", "A002.jpg"))).resolves.toBeTruthy();
    await expect(stat(path.join(workShoot, "SELECT", "JPG_SELECT"))).resolves.toBeTruthy();
    const summary = JSON.parse(await readFile(path.join(workShoot, "REPORT", "summary.json"), "utf8"));
    expect(summary).toMatchObject({ totalJpg: 2, totalRaw: 1, totalScenes: 2 });
  });

  it("organizes a manually prepared work copy without touching a source root", async () => {
    const { roots } = await testRoots();
    const workShoot = path.join(roots.workRoot, "manual-copy");
    await mkdir(workShoot);
    await jpg(path.join(workShoot, "B001.jpg"), "#FFFFFF", new Date("2026-09-13T01:00:00Z"));

    const result = await runRemotePhotoSortRunner({
      ...runnerOptions(),
      workFolder: workShoot,
    }, { roots });

    expect(result.sceneCount).toBe(1);
    await expect(stat(path.join(workShoot, "JPG", "Scene01", "B001.jpg"))).resolves.toBeTruthy();
  });

  it("runs the precise local-feature path without browser Image, Canvas, or Worker APIs", async () => {
    const { roots } = await testRoots();
    const workShoot = path.join(roots.workRoot, "precise-copy");
    await mkdir(workShoot);
    await jpg(path.join(workShoot, "C001.jpg"), "#155855", new Date("2026-09-13T01:00:00Z"));
    await jpg(path.join(workShoot, "C002.jpg"), "#155855", new Date("2026-09-13T01:00:02Z"));
    await jpg(path.join(workShoot, "C003.jpg"), "#E85D2C", new Date("2026-09-13T01:10:00Z"));

    const originalOpenAiKey = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    try {
      const result = await runRemotePhotoSortRunner({
        ...runnerOptions(),
        fastAnalyzeMode: false,
        workFolder: workShoot,
      }, { roots });

      expect(result).toMatchObject({ ok: true, jpgCount: 3, sceneCount: 2 });
      await expect(stat(path.join(workShoot, "JPG", "01_기타", "C001.jpg"))).resolves.toBeTruthy();
      await expect(stat(path.join(workShoot, "JPG", "02_기타", "C003.jpg"))).resolves.toBeTruthy();
    } finally {
      if (originalOpenAiKey === undefined) delete process.env.OPENAI_API_KEY;
      else process.env.OPENAI_API_KEY = originalOpenAiKey;
    }
  });

  it("labels only an unresolved precise Scene through the existing representative Scene analyzer", async () => {
    const { roots } = await testRoots();
    const workShoot = path.join(roots.workRoot, "precise-scene-name");
    await mkdir(workShoot);
    for (let index = 0; index < 8; index++) {
      await jpg(
        path.join(workShoot, `D${String(index + 1).padStart(3, "0")}.jpg`),
        "#155855",
        new Date(Date.parse("2026-09-13T01:00:00Z") + index * 1_000),
      );
    }
    let representativeCount = 0;
    const originalOpenAiKey = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    try {
      const result = await runRemotePhotoSortRunner({
        ...runnerOptions(),
        fastAnalyzeMode: false,
        aiNamingEnabled: true,
        workFolder: workShoot,
      }, {
        roots,
        ai: {
          scene: async (input) => {
            representativeCount = input.images.length;
            return {
              department: "dermatology", sceneId: input.sceneId, sceneType: "treatment", displayName: "시술",
              suggestedFolderName: "시술", confidence: 0.95, detectedCues: ["핸드피스"], negativeCues: [],
              reason: "시술 장면", needsReview: false, patientPosture: "lying_down", hasHandpiece: true,
              hasTreatmentDevice: true, hasTreatmentBed: true, hasConsultationDesk: false,
            };
          },
        },
      });

      expect(result).toMatchObject({ ok: true, sceneCount: 1 });
      expect(representativeCount).toBe(6);
      await expect(stat(path.join(workShoot, "JPG", "01_시술", "D001.jpg"))).resolves.toBeTruthy();
      const report = JSON.parse(await readFile(path.join(workShoot, "REPORT", "scene_report.json"), "utf8"));
      expect(report.scenes[0]).toMatchObject({ folderName: "01_시술", sceneType: "treatment" });
    } finally {
      if (originalOpenAiKey === undefined) delete process.env.OPENAI_API_KEY;
      else process.env.OPENAI_API_KEY = originalOpenAiKey;
    }
  });

  it("keeps 기타 and records a warning when remote Scene labeling fails", async () => {
    const { roots } = await testRoots();
    const workShoot = path.join(roots.workRoot, "precise-scene-fallback");
    await mkdir(workShoot);
    await jpg(path.join(workShoot, "E001.jpg"), "#155855", new Date("2026-09-13T01:00:00Z"));

    const originalOpenAiKey = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    try {
      const result = await runRemotePhotoSortRunner({
        ...runnerOptions(),
        fastAnalyzeMode: false,
        aiNamingEnabled: true,
        workFolder: workShoot,
      }, {
        roots,
        ai: { scene: async () => { throw new Error("remote scene unavailable"); } },
      });

      expect(result).toMatchObject({ ok: true, sceneCount: 1 });
      await expect(stat(path.join(workShoot, "JPG", "01_기타", "E001.jpg"))).resolves.toBeTruthy();
      const summary = JSON.parse(await readFile(path.join(workShoot, "REPORT", "summary.json"), "utf8"));
      expect(summary.warnings).toEqual(expect.arrayContaining([
        expect.objectContaining({ stage: "SCENE_ANALYSIS", message: "remote scene unavailable" }),
      ]));
    } finally {
      if (originalOpenAiKey === undefined) delete process.env.OPENAI_API_KEY;
      else process.env.OPENAI_API_KEY = originalOpenAiKey;
    }
  });

  it("fails unsupported studio mode before creating output folders", async () => {
    const { roots } = await testRoots();
    const workShoot = path.join(roots.workRoot, "studio");
    await mkdir(workShoot);

    await expect(runRemotePhotoSortRunner({
      ...runnerOptions(),
      shootingMode: "studio",
      workFolder: workShoot,
    }, { roots })).rejects.toThrow(/field만 지원/);
    await expect(stat(path.join(workShoot, "JPG"))).rejects.toThrow();
  });
});
