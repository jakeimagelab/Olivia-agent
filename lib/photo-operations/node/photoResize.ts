import { lstat, readFile, readdir, rename, stat, unlink, utimes, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { JPG_PHOTO_EXTENSIONS } from "@/lib/photo-classifier/constants";
import type { RunnerProgress, RunnerRoots } from "@/lib/photo-classifier/node/types";
import { extractJpegMetadataSegments, preserveJpegMetadata } from "@/lib/photoResize/jpegMetadata";
import { resultFolderName } from "@/lib/photoResize/resizePhotos";
import { ensureSafeDirectory, extension, isInside, posixRelative, requireSafeDirectory, resolvePhotoWorkProjectDirectory } from "./common";

const DEFAULT_INPUT_DIRECTORY = "씬별분류";
const MANIFEST_DIRECTORY = ".olivia";
const TEMP_SUFFIX = ".olivia-part";

type SourcePhoto = { path: string; relativePath: string; size: number; mtimeMs: number };

export type PhotoResizeNodeInput = {
  projectRelativePath: string;
  inputRelativePath?: string;
  longEdge?: number;
  quality?: number;
  roots?: RunnerRoots;
  onProgress?: (progress: RunnerProgress) => void;
};

export type PhotoResizeNodeResult = {
  ok: boolean;
  status: "RESIZE_COMPLETED" | "REVIEW_REQUIRED" | "RESIZE_FAILED";
  projectRelativePath: string;
  inputRelativePath: string;
  outputRelativePath: string;
  longEdge: number;
  quality: number;
  sourceCount: number;
  completedCount: number;
  skippedCount: number;
  failedCount: number;
  sourceUnchanged: boolean;
  metadataPreserved: boolean;
  failures: Array<{ path: string; reason: string }>;
  error?: string;
};

function validateOptions(input: PhotoResizeNodeInput): { longEdge: number; quality: number } {
  const longEdge = input.longEdge ?? 4000;
  const quality = input.quality ?? 95;
  if (!Number.isInteger(longEdge) || longEdge < 500 || longEdge > 10_000) throw new Error("긴 변 해상도는 500~10000px 정수여야 합니다.");
  if (!Number.isInteger(quality) || quality < 1 || quality > 100) throw new Error("JPEG 품질은 1~100 정수여야 합니다.");
  return { longEdge, quality };
}

function validateSubpath(value: string): string {
  if (!value || value.includes("\0") || value.includes("\\") || value.startsWith("/") || path.isAbsolute(value)) throw new Error("리사이즈 입력은 프로젝트 기준 상대경로여야 합니다.");
  const segments = value.split("/");
  if (segments.some((segment) => !segment || segment === "." || segment === "..")) throw new Error("리사이즈 입력 경로가 올바르지 않습니다.");
  return segments.join("/");
}

async function collectSourcePhotos(inputDirectory: string, outputName: string): Promise<SourcePhoto[]> {
  const photos: SourcePhoto[] = [];
  const visit = async (directory: string): Promise<void> => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const fullPath = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) throw new Error(`리사이즈 입력에 심볼릭 링크가 있습니다: ${posixRelative(inputDirectory, fullPath)}`);
      if (entry.isDirectory()) {
        if (directory === inputDirectory && (entry.name === outputName || /^\d+px_Q\d+$/.test(entry.name) || entry.name === MANIFEST_DIRECTORY)) continue;
        await visit(fullPath);
        continue;
      }
      if (!entry.isFile() || !JPG_PHOTO_EXTENSIONS.has(extension(entry.name))) continue;
      const metadata = await stat(fullPath);
      photos.push({ path: fullPath, relativePath: posixRelative(inputDirectory, fullPath), size: metadata.size, mtimeMs: metadata.mtimeMs });
    }
  };
  await visit(inputDirectory);
  return photos.sort((left, right) => left.relativePath.localeCompare(right.relativePath, "en", { numeric: true, sensitivity: "base" }));
}

function sameSnapshot(before: SourcePhoto[], after: SourcePhoto[]): boolean {
  if (before.length !== after.length) return false;
  return before.every((file, index) => {
    const current = after[index];
    return current?.relativePath === file.relativePath && current.size === file.size && current.mtimeMs === file.mtimeMs;
  });
}

function metadataSegmentsEqual(source: Uint8Array, output: Uint8Array): boolean {
  const sourceSegments = extractJpegMetadataSegments(source);
  const outputSegments = extractJpegMetadataSegments(output);
  return sourceSegments.every((segment) => outputSegments.some((candidate) => Buffer.from(candidate).equals(Buffer.from(segment))));
}

async function writeManifest(projectRoot: string, outputName: string, data: Record<string, unknown>): Promise<string> {
  const stateDirectory = path.join(projectRoot, MANIFEST_DIRECTORY);
  await ensureSafeDirectory(projectRoot, stateDirectory);
  const finalPath = path.join(stateDirectory, `resize-${outputName}.json`);
  const temporary = `${finalPath}.tmp`;
  await writeFile(temporary, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  await rename(temporary, finalPath);
  return posixRelative(projectRoot, finalPath);
}

export async function runPhotoResizeNode(input: PhotoResizeNodeInput): Promise<PhotoResizeNodeResult> {
  const { longEdge, quality } = validateOptions(input);
  const inputRelativePath = validateSubpath(input.inputRelativePath ?? DEFAULT_INPUT_DIRECTORY);
  const directories = await resolvePhotoWorkProjectDirectory({ projectRelativePath: input.projectRelativePath, roots: input.roots });
  const inputCandidate = path.resolve(directories.workProject, ...inputRelativePath.split("/"));
  if (!isInside(directories.workProject, inputCandidate)) throw new Error("리사이즈 입력이 SSD2 프로젝트 밖을 가리킵니다.");
  const inputDirectory = await requireSafeDirectory(inputCandidate, "리사이즈 입력 폴더");
  if (!isInside(directories.workProject, inputDirectory)) throw new Error("리사이즈 입력이 SSD2 프로젝트 밖을 가리킵니다.");
  const outputName = resultFolderName({ longEdge, quality });
  const outputDirectory = path.join(inputDirectory, outputName);
  const outputRelativePath = path.posix.join(inputRelativePath, outputName);
  input.onProgress?.({ stage: "SCANNING", message: "리사이즈할 JPG와 기존 결과를 확인하는 중입니다." });
  const sourceBefore = await collectSourcePhotos(inputDirectory, outputName);
  if (!sourceBefore.length) {
    return {
      ok: false, status: "REVIEW_REQUIRED", projectRelativePath: directories.relativePath, inputRelativePath, outputRelativePath,
      longEdge, quality, sourceCount: 0, completedCount: 0, skippedCount: 0, failedCount: 0, sourceUnchanged: true,
      metadataPreserved: true, failures: [], error: "리사이즈할 JPG/JPEG가 없습니다.",
    };
  }

  const outputMetadata = await lstat(outputDirectory).catch(() => null);
  if (outputMetadata) {
    if (outputMetadata.isSymbolicLink() || !outputMetadata.isDirectory()) {
      return {
        ok: false, status: "REVIEW_REQUIRED", projectRelativePath: directories.relativePath, inputRelativePath, outputRelativePath,
        longEdge, quality, sourceCount: sourceBefore.length, completedCount: 0, skippedCount: 0, failedCount: 0,
        sourceUnchanged: true, metadataPreserved: true, failures: [], error: "기존 리사이즈 결과 경로가 안전한 폴더가 아닙니다.",
      };
    }
    const existing = await collectSourcePhotos(outputDirectory, "__none__");
    const expected = new Map(sourceBefore.map((file) => [file.relativePath, file]));
    const complete = existing.length === sourceBefore.length && existing.every((file) => expected.has(file.relativePath));
    if (complete) {
      return {
        ok: true, status: "RESIZE_COMPLETED", projectRelativePath: directories.relativePath, inputRelativePath, outputRelativePath,
        longEdge, quality, sourceCount: sourceBefore.length, completedCount: 0, skippedCount: existing.length, failedCount: 0,
        sourceUnchanged: true, metadataPreserved: true, failures: [],
      };
    }
    return {
      ok: false, status: "REVIEW_REQUIRED", projectRelativePath: directories.relativePath, inputRelativePath, outputRelativePath,
      longEdge, quality, sourceCount: sourceBefore.length, completedCount: 0, skippedCount: existing.length, failedCount: 0,
      sourceUnchanged: true, metadataPreserved: true, failures: [], error: "부분 리사이즈 결과가 이미 존재합니다. 기존 결과를 확인해주세요.",
    };
  }

  await ensureSafeDirectory(directories.workRoot, outputDirectory);
  let completedCount = 0;
  let metadataPreserved = true;
  const failures: Array<{ path: string; reason: string }> = [];
  input.onProgress?.({ stage: "ANALYZING", current: 0, total: sourceBefore.length, message: "JPG를 리사이즈하고 원본 메타데이터를 복원하고 있습니다." });
  for (const file of sourceBefore) {
    const destination = path.join(outputDirectory, ...file.relativePath.split("/"));
    const destinationParent = path.dirname(destination);
    await ensureSafeDirectory(directories.workRoot, destinationParent);
    const temporary = path.join(destinationParent, `.${path.basename(destination)}${TEMP_SUFFIX}`);
    try {
      if (await lstat(destination).catch(() => null)) throw new Error("같은 이름의 결과 파일이 이미 존재합니다.");
      const staleTemporary = await lstat(temporary).catch(() => null);
      if (staleTemporary) {
        if (staleTemporary.isSymbolicLink() || !staleTemporary.isFile()) throw new Error("안전하지 않은 임시 파일이 있습니다.");
        await unlink(temporary);
      }
      const sourceBytes = new Uint8Array(await readFile(file.path));
      const encoded = await sharp(sourceBytes).rotate().resize({ width: longEdge, height: longEdge, fit: "inside", withoutEnlargement: true }).jpeg({ quality }).toBuffer();
      const outputBytes = preserveJpegMetadata(sourceBytes, encoded);
      await writeFile(temporary, outputBytes, { flag: "wx" });
      if (!metadataSegmentsEqual(sourceBytes, outputBytes)) {
        metadataPreserved = false;
        throw new Error("JPEG 메타데이터 보존 검증에 실패했습니다.");
      }
      const outputInfo = await sharp(outputBytes).metadata();
      if (!outputInfo.width || !outputInfo.height || Math.max(outputInfo.width, outputInfo.height) > longEdge) throw new Error("리사이즈 해상도 검증에 실패했습니다.");
      await utimes(temporary, new Date(), new Date(file.mtimeMs));
      await rename(temporary, destination);
      completedCount += 1;
    } catch (error) {
      await unlink(temporary).catch(() => undefined);
      failures.push({ path: file.relativePath, reason: error instanceof Error ? error.message : "리사이즈 실패" });
      break;
    }
    input.onProgress?.({ stage: "ANALYZING", current: completedCount, total: sourceBefore.length, message: `리사이즈: ${file.relativePath}` });
  }

  input.onProgress?.({ stage: "VERIFYING", current: completedCount, total: sourceBefore.length, message: "리사이즈 결과와 원본 불변 상태를 확인하고 있습니다." });
  const sourceUnchanged = sameSnapshot(sourceBefore, await collectSourcePhotos(inputDirectory, outputName));
  if (failures.length || completedCount !== sourceBefore.length || !sourceUnchanged || !metadataPreserved) {
    return {
      ok: false, status: "RESIZE_FAILED", projectRelativePath: directories.relativePath, inputRelativePath, outputRelativePath,
      longEdge, quality, sourceCount: sourceBefore.length, completedCount, skippedCount: 0, failedCount: failures.length || 1,
      sourceUnchanged, metadataPreserved, failures,
      error: failures[0]?.reason || (!sourceUnchanged ? "리사이즈 후 원본 파일이 변경되었습니다." : "리사이즈 전체 검증에 실패했습니다."),
    };
  }
  await writeManifest(directories.workProject, outputName, {
    projectRelativePath: directories.relativePath, inputRelativePath, outputRelativePath, longEdge, quality,
    sourceCount: sourceBefore.length, completedCount, sourceUnchanged, metadataPreserved, completedAt: new Date().toISOString(),
  });
  return {
    ok: true, status: "RESIZE_COMPLETED", projectRelativePath: directories.relativePath, inputRelativePath, outputRelativePath,
    longEdge, quality, sourceCount: sourceBefore.length, completedCount, skippedCount: 0, failedCount: 0,
    sourceUnchanged, metadataPreserved, failures: [],
  };
}

export const PHOTO_RESIZE_DEFAULT_INPUT = DEFAULT_INPUT_DIRECTORY;
