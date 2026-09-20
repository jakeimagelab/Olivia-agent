import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { runPhotoRawMatch } from "@/lib/photo-operations/node/photoRawMatch";
import { runPhotoResizeNode } from "@/lib/photo-operations/node/photoResize";
import { runPhotoAiSelect } from "@/lib/photo-operations/node/photoAiSelect";
import { runPhotoRetouch } from "@/lib/photo-operations/node/photoRetouch";
import { extractJpegMetadataSegments } from "@/lib/photoResize/jpegMetadata";

const temporaryRoots: string[] = [];

async function setup() {
  const base = await mkdtemp(path.join(os.tmpdir(), "olivia-photo-operations-"));
  temporaryRoots.push(base);
  const roots = { sourceRoot: path.join(base, "ssd1"), workRoot: path.join(base, "ssd2") };
  const sourceProject = path.join(roots.sourceRoot, "0919_test");
  const workProject = path.join(roots.workRoot, "0919_test");
  await mkdir(sourceProject, { recursive: true });
  await mkdir(workProject, { recursive: true });
  return { roots, sourceProject, workProject };
}

async function jpeg(color: { r: number; g: number; b: number }, width = 80, height = 60) {
  return sharp({ create: { width, height, channels: 3, background: color } }).jpeg({ quality: 92 }).withMetadata({ orientation: 1 }).toBuffer();
}

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("Mac Studio 사진 후속 작업", () => {
  it("최신 고객 셀렉 파일명만 RAW로 매칭하고 SSD1 RAW를 변경하지 않는다", async () => {
    const { roots, sourceProject, workProject } = await setup();
    await mkdir(path.join(sourceProject, "RAW-A"));
    await writeFile(path.join(sourceProject, "RAW-A", "A001.ARW"), "raw-one");
    await writeFile(path.join(sourceProject, "RAW-A", "A002.CR3"), "raw-two");
    await mkdir(path.join(workProject, "씬별분류"));
    await writeFile(path.join(workProject, "씬별분류", "A001.JPG"), await jpeg({ r: 180, g: 150, b: 140 }));
    const before = await stat(path.join(sourceProject, "RAW-A", "A001.ARW"));
    const result = await runPhotoRawMatch({ roots, projectRelativePath: "0919_test", selectedFileNames: ["A001.JPG", "MISSING.JPG"] });
    expect(result).toMatchObject({ ok: true, status: "RAW_MATCH_COMPLETED", selectionSource: "customer_selection", selectedCount: 2, matchedCount: 1, rawSourceUnchanged: true, missingNames: ["missing"] });
    await expect(readFile(path.join(workProject, "Selected_RAW", "A001.ARW"), "utf8")).resolves.toBe("raw-one");
    await expect(stat(path.join(workProject, "Selected_RAW", "A002.CR3"))).rejects.toThrow();
    const after = await stat(path.join(sourceProject, "RAW-A", "A001.ARW"));
    expect({ size: after.size, mtimeMs: after.mtimeMs }).toEqual({ size: before.size, mtimeMs: before.mtimeMs });
  });

  it("고객 셀렉이 없으면 XMP rating 1 이상만 쓰고, 선택 근거가 없으면 전체 매칭하지 않는다", async () => {
    const first = await setup();
    await writeFile(path.join(first.sourceProject, "A001.ARW"), "raw");
    await mkdir(path.join(first.workProject, "씬별분류"));
    await writeFile(path.join(first.workProject, "씬별분류", "A001.JPG"), await jpeg({ r: 160, g: 130, b: 120 }));
    await writeFile(path.join(first.workProject, "씬별분류", "A001.xmp"), '<x:xmpmeta><rdf:Description xmp:Rating="1" /></x:xmpmeta>');
    const xmpResult = await runPhotoRawMatch({ roots: first.roots, projectRelativePath: "0919_test" });
    expect(xmpResult).toMatchObject({ ok: true, selectionSource: "xmp_rating", matchedCount: 1 });

    const second = await setup();
    await writeFile(path.join(second.sourceProject, "B001.ARW"), "raw");
    await mkdir(path.join(second.workProject, "씬별분류"));
    await writeFile(path.join(second.workProject, "씬별분류", "B001.JPG"), await jpeg({ r: 160, g: 130, b: 120 }));
    const noSelection = await runPhotoRawMatch({ roots: second.roots, projectRelativePath: "0919_test" });
    expect(noSelection).toMatchObject({ ok: false, status: "REVIEW_REQUIRED", matchedCount: 0, selectionSource: "none" });
  });

  it("셀렉 파일명이 모두 누락되면 성공으로 보고하지 않고 RAW를 하나도 복사하지 않는다", async () => {
    const { roots, sourceProject, workProject } = await setup();
    await writeFile(path.join(sourceProject, "A001.ARW"), "raw");
    const result = await runPhotoRawMatch({ roots, projectRelativePath: "0919_test", selectedFileNames: ["MISSING.JPG"] });
    expect(result).toMatchObject({
      ok: false,
      status: "REVIEW_REQUIRED",
      selectionSource: "customer_selection",
      selectedCount: 1,
      matchedCount: 0,
      missingNames: ["missing"],
      rawSourceUnchanged: true,
    });
    await expect(stat(path.join(workProject, "Selected_RAW"))).rejects.toThrow();
  });

  it("리사이즈는 별도 폴더에 쓰고 EXIF 계열 metadata와 원본 mtime을 보존한다", async () => {
    const { roots, workProject } = await setup();
    const scene = path.join(workProject, "씬별분류", "Scene01");
    await mkdir(scene, { recursive: true });
    const sourcePath = path.join(scene, "A001.JPG");
    const sourceBytes = await jpeg({ r: 190, g: 150, b: 130 }, 1200, 800);
    await writeFile(sourcePath, sourceBytes);
    const before = await stat(sourcePath);
    const result = await runPhotoResizeNode({ roots, projectRelativePath: "0919_test", longEdge: 600, quality: 88 });
    expect(result).toMatchObject({ ok: true, status: "RESIZE_COMPLETED", sourceCount: 1, completedCount: 1, sourceUnchanged: true, metadataPreserved: true });
    const outputPath = path.join(workProject, "씬별분류", "600px_Q88", "Scene01", "A001.JPG");
    const outputBytes = await readFile(outputPath);
    expect((await sharp(outputBytes).metadata()).width).toBe(600);
    expect(extractJpegMetadataSegments(outputBytes)).toEqual(extractJpegMetadataSegments(sourceBytes));
    const after = await stat(sourcePath);
    expect({ size: after.size, mtimeMs: after.mtimeMs }).toEqual({ size: before.size, mtimeMs: before.mtimeMs });
  });

  it("AI 셀렉은 기존 품질·중복 규칙으로 manifest만 만들고 JPG를 이동하지 않는다", async () => {
    const { roots, workProject } = await setup();
    const scene = path.join(workProject, "씬별분류", "Scene01");
    await mkdir(scene, { recursive: true });
    const bytes = await jpeg({ r: 180, g: 150, b: 130 });
    await writeFile(path.join(scene, "A001.JPG"), bytes);
    await writeFile(path.join(scene, "A002.JPG"), bytes);
    const before = await Promise.all(["A001.JPG", "A002.JPG"].map((name) => stat(path.join(scene, name))));
    const result = await runPhotoAiSelect({ roots, projectRelativePath: "0919_test", options: { qualityFilter: false, dupRemoval: true, dupThreshold: 95 } });
    expect(result).toMatchObject({ ok: true, status: "AI_SELECT_COMPLETED", totalCount: 2, selectedCount: 1, duplicateRemovedCount: 1, sourceUnchanged: true });
    const manifest = JSON.parse(await readFile(path.join(workProject, "AI_SELECT_REPORT", "selection-manifest.json"), "utf8"));
    expect(manifest.photos).toHaveLength(2);
    const after = await Promise.all(["A001.JPG", "A002.JPG"].map((name) => stat(path.join(scene, name))));
    expect(after.map(({ size, mtimeMs }) => ({ size, mtimeMs }))).toEqual(before.map(({ size, mtimeMs }) => ({ size, mtimeMs })));
  });

  it("보정은 명시한 사진만 분석해 가이드를 저장하고 픽셀 파일을 변경하지 않는다", async () => {
    const { roots, workProject } = await setup();
    const scene = path.join(workProject, "씬별분류", "Scene01");
    await mkdir(scene, { recursive: true });
    const sourcePath = path.join(scene, "A001.JPG");
    await writeFile(sourcePath, await jpeg({ r: 190, g: 150, b: 130 }));
    const before = await stat(sourcePath);
    const analyzer = vi.fn(async () => ({
      detected: true,
      skinHighlight: { r: 244, g: 224, b: 210 },
      skinMid: { r: 217, g: 186, b: 169 },
      skinShadow: { r: 182, g: 146, b: 130 },
      whiteRef: { r: 250, g: 250, b: 250, found: true },
      colorTemp: "뉴트럴", saturation: "적당", skinNote: "정상", confidence: 99,
    }));
    const result = await runPhotoRetouch({ roots, projectRelativePath: "0919_test", fileNames: ["A001.JPG"], checkType: "skin", analyzer });
    expect(result).toMatchObject({ ok: true, status: "RETOUCH_ANALYSIS_COMPLETED", analyzedCount: 1, sourceUnchanged: true });
    expect(analyzer).toHaveBeenCalledTimes(1);
    const report = JSON.parse(await readFile(path.join(workProject, "RETOUCH_REPORT", "analysis-manifest.json"), "utf8"));
    expect(report.results[0].analysis.matchScore).toBe(100);
    const after = await stat(sourcePath);
    expect({ size: after.size, mtimeMs: after.mtimeMs }).toEqual({ size: before.size, mtimeMs: before.mtimeMs });
  });
});
