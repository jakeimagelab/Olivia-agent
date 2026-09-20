import { createHash } from "node:crypto";
import { constants as fsConstants, createReadStream } from "node:fs";
import { copyFile, lstat, open, readdir, readFile, rename, stat, unlink, utimes } from "node:fs/promises";
import path from "node:path";
import type { RunnerProgress, RunnerRoots } from "@/lib/photo-classifier/node/types";
import { readRatingFromXmpText } from "@/lib/selectMatch/bridgeRating";
import { SELECT_MATCH_RAW_EXTENSIONS } from "@/lib/selectMatch/nameParsing";
import { ensureSafeDirectory, extension, posixRelative, resolvePhotoProjectDirectories } from "./common";

const JPG_EXTENSIONS = new Set(["jpg", "jpeg"]);
const OUTPUT_DIRECTORY = "Selected_RAW";
const TEMP_SUFFIX = ".olivia-part";

type RawFile = { path: string; relativePath: string; name: string; basename: string; size: number; mtimeMs: number };
type RawSnapshot = Map<string, { size: number; mtimeMs: number }>;

export type PhotoRawMatchInput = {
  projectRelativePath: string;
  selectedFileNames?: string[];
  roots?: RunnerRoots;
  onProgress?: (progress: RunnerProgress) => void;
};

export type PhotoRawMatchResult = {
  ok: boolean;
  status: "RAW_MATCH_COMPLETED" | "REVIEW_REQUIRED" | "RAW_MATCH_FAILED";
  projectRelativePath: string;
  selectionSource: "customer_selection" | "xmp_rating" | "none";
  selectedCount: number;
  rawFoundCount: number;
  matchedCount: number;
  alreadyCopiedCount: number;
  missingNames: string[];
  ambiguousNames: string[];
  rawSourceUnchanged: boolean;
  outputRelativePath: string;
  error?: string;
};

function selectedBasename(name: string): string | null {
  const trimmed = path.basename(name.trim());
  if (!trimmed || trimmed.includes("\0")) return null;
  return trimmed.replace(/\.[^.]+$/, "").toLocaleLowerCase("en-US");
}

async function sha256(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    const stream = createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.once("error", reject);
    stream.once("end", () => resolve(hash.digest("hex")));
  });
}

async function collectRawFiles(sourceProject: string): Promise<{ files: RawFile[]; snapshot: RawSnapshot }> {
  const files: RawFile[] = [];
  const snapshot: RawSnapshot = new Map();
  const visit = async (directory: string): Promise<void> => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const fullPath = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) throw new Error(`RAW 검색 중 심볼릭 링크가 발견되었습니다: ${posixRelative(sourceProject, fullPath)}`);
      if (entry.isDirectory()) {
        if (entry.name === "JPG전체") continue;
        await visit(fullPath);
        continue;
      }
      if (!entry.isFile() || !SELECT_MATCH_RAW_EXTENSIONS.has(extension(entry.name))) continue;
      const metadata = await stat(fullPath);
      const relativePath = posixRelative(sourceProject, fullPath);
      files.push({
        path: fullPath,
        relativePath,
        name: entry.name,
        basename: entry.name.replace(/\.[^.]+$/, "").toLocaleLowerCase("en-US"),
        size: metadata.size,
        mtimeMs: metadata.mtimeMs,
      });
      snapshot.set(relativePath, { size: metadata.size, mtimeMs: metadata.mtimeMs });
    }
  };
  await visit(sourceProject);
  files.sort((left, right) => left.relativePath.localeCompare(right.relativePath, "en", { numeric: true, sensitivity: "base" }));
  return { files, snapshot };
}

async function collectRawSnapshot(sourceProject: string): Promise<RawSnapshot> {
  return (await collectRawFiles(sourceProject)).snapshot;
}

function sameSnapshot(before: RawSnapshot, after: RawSnapshot): boolean {
  if (before.size !== after.size) return false;
  for (const [relativePath, value] of before) {
    const current = after.get(relativePath);
    if (!current || current.size !== value.size || current.mtimeMs !== value.mtimeMs) return false;
  }
  return true;
}

async function readEmbeddedRating(filePath: string): Promise<number | null> {
  const handle = await open(filePath, "r");
  try {
    const buffer = Buffer.alloc(131_072);
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    const text = buffer.subarray(0, bytesRead).toString("utf8");
    const start = text.indexOf("<x:xmpmeta");
    if (start === -1) return null;
    const end = text.indexOf("</x:xmpmeta>", start);
    return readRatingFromXmpText(text.slice(start, end === -1 ? start + 4096 : end + 12));
  } finally {
    await handle.close();
  }
}

async function collectXmpRatedNames(workProject: string): Promise<string[]> {
  const selected = new Set<string>();
  const visit = async (directory: string): Promise<void> => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const fullPath = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) throw new Error(`SSD2 선택 폴더에 심볼릭 링크가 있습니다: ${posixRelative(workProject, fullPath)}`);
      if (entry.isDirectory()) {
        if (entry.name === OUTPUT_DIRECTORY || entry.name === ".olivia" || /^\d+px_Q\d+$/.test(entry.name)) continue;
        await visit(fullPath);
        continue;
      }
      if (!entry.isFile() || !JPG_EXTENSIONS.has(extension(entry.name))) continue;
      const basename = entry.name.replace(/\.[^.]+$/, "");
      let rating: number | null = null;
      for (const suffix of [".xmp", ".XMP"]) {
        const sidecar = path.join(directory, `${basename}${suffix}`);
        const sidecarMetadata = await lstat(sidecar).catch(() => null);
        if (!sidecarMetadata) continue;
        if (sidecarMetadata.isSymbolicLink() || !sidecarMetadata.isFile()) throw new Error(`안전하지 않은 XMP 사이드카입니다: ${posixRelative(workProject, sidecar)}`);
        rating = readRatingFromXmpText(await readFile(sidecar, "utf8"));
        break;
      }
      if (rating === null) rating = await readEmbeddedRating(fullPath);
      if (rating !== null && rating >= 1) selected.add(basename.toLocaleLowerCase("en-US"));
    }
  };
  await visit(workProject);
  return [...selected].sort((left, right) => left.localeCompare(right, "en", { numeric: true, sensitivity: "base" }));
}

function failure(input: Omit<PhotoRawMatchResult, "ok">): PhotoRawMatchResult {
  return { ok: false, ...input };
}

export async function runPhotoRawMatch(input: PhotoRawMatchInput): Promise<PhotoRawMatchResult> {
  const directories = await resolvePhotoProjectDirectories({ projectRelativePath: input.projectRelativePath, roots: input.roots });
  input.onProgress?.({ stage: "SCANNING", message: "SSD1 RAW와 셀렉 파일명을 확인하는 중입니다." });
  const rawCollection = await collectRawFiles(directories.sourceProject);
  const explicit = (input.selectedFileNames ?? []).map(selectedBasename).filter((value): value is string => Boolean(value));
  const selected = [...new Set(explicit)];
  let selectionSource: PhotoRawMatchResult["selectionSource"] = selected.length ? "customer_selection" : "none";
  if (!selected.length) {
    selected.push(...await collectXmpRatedNames(directories.workProject));
    if (selected.length) selectionSource = "xmp_rating";
  }
  if (!selected.length) {
    return failure({
      status: "REVIEW_REQUIRED", projectRelativePath: directories.relativePath, selectionSource: "none", selectedCount: 0,
      rawFoundCount: rawCollection.files.length, matchedCount: 0, alreadyCopiedCount: 0, missingNames: [], ambiguousNames: [],
      rawSourceUnchanged: true, outputRelativePath: OUTPUT_DIRECTORY,
      error: "고객 셀렉 제출본이나 XMP 별점 선택본이 없습니다. 매칭할 사진을 먼저 선택해주세요.",
    });
  }

  const rawByBasename = new Map<string, RawFile[]>();
  for (const file of rawCollection.files) rawByBasename.set(file.basename, [...(rawByBasename.get(file.basename) ?? []), file]);
  const missingNames = selected.filter((name) => !rawByBasename.has(name));
  const ambiguousNames = selected.filter((name) => (rawByBasename.get(name)?.length ?? 0) > 1);
  if (ambiguousNames.length) {
    return failure({
      status: "REVIEW_REQUIRED", projectRelativePath: directories.relativePath, selectionSource, selectedCount: selected.length,
      rawFoundCount: rawCollection.files.length, matchedCount: 0, alreadyCopiedCount: 0, missingNames, ambiguousNames,
      rawSourceUnchanged: true, outputRelativePath: OUTPUT_DIRECTORY,
      error: `동일 basename의 RAW 후보가 중복되었습니다: ${ambiguousNames.slice(0, 10).join(", ")}`,
    });
  }

  const matches = selected.flatMap((name) => rawByBasename.get(name) ?? []);
  if (!matches.length) {
    return failure({
      status: "REVIEW_REQUIRED", projectRelativePath: directories.relativePath, selectionSource, selectedCount: selected.length,
      rawFoundCount: rawCollection.files.length, matchedCount: 0, alreadyCopiedCount: 0, missingNames, ambiguousNames: [],
      rawSourceUnchanged: true, outputRelativePath: OUTPUT_DIRECTORY,
      error: "선택된 JPG와 이름이 일치하는 RAW를 찾지 못했습니다. 파일명과 원본 폴더를 확인해주세요.",
    });
  }
  const outputDirectory = path.join(directories.workProject, OUTPUT_DIRECTORY);
  const outputMetadata = await lstat(outputDirectory).catch(() => null);
  if (outputMetadata && (outputMetadata.isSymbolicLink() || !outputMetadata.isDirectory())) {
    return failure({
      status: "REVIEW_REQUIRED", projectRelativePath: directories.relativePath, selectionSource, selectedCount: selected.length,
      rawFoundCount: rawCollection.files.length, matchedCount: 0, alreadyCopiedCount: 0, missingNames, ambiguousNames,
      rawSourceUnchanged: true, outputRelativePath: OUTPUT_DIRECTORY, error: "Selected_RAW가 안전한 폴더가 아닙니다.",
    });
  }

  const existing = new Set<string>();
  for (const file of matches) {
    const destination = path.join(outputDirectory, file.name);
    const metadata = await lstat(destination).catch(() => null);
    if (!metadata) continue;
    if (metadata.isSymbolicLink() || !metadata.isFile()) {
      return failure({
        status: "REVIEW_REQUIRED", projectRelativePath: directories.relativePath, selectionSource, selectedCount: selected.length,
        rawFoundCount: rawCollection.files.length, matchedCount: 0, alreadyCopiedCount: existing.size, missingNames, ambiguousNames,
        rawSourceUnchanged: true, outputRelativePath: OUTPUT_DIRECTORY, error: `기존 결과가 안전한 일반 파일이 아닙니다: ${file.name}`,
      });
    }
    if (metadata.size !== file.size || await sha256(destination) !== await sha256(file.path)) {
      return failure({
        status: "REVIEW_REQUIRED", projectRelativePath: directories.relativePath, selectionSource, selectedCount: selected.length,
        rawFoundCount: rawCollection.files.length, matchedCount: 0, alreadyCopiedCount: existing.size, missingNames, ambiguousNames,
        rawSourceUnchanged: true, outputRelativePath: OUTPUT_DIRECTORY, error: `같은 이름의 다른 RAW 결과가 이미 존재합니다: ${file.name}`,
      });
    }
    existing.add(file.name);
  }

  if (matches.length) await ensureSafeDirectory(directories.workRoot, outputDirectory);
  let copied = 0;
  input.onProgress?.({ stage: "COPYING", current: existing.size, total: matches.length, message: "선택된 JPG와 일치하는 RAW를 복사하고 있습니다." });
  try {
    for (const file of matches) {
      if (existing.has(file.name)) continue;
      const destination = path.join(outputDirectory, file.name);
      const temporary = path.join(outputDirectory, `.${file.name}${TEMP_SUFFIX}`);
      const temporaryMetadata = await lstat(temporary).catch(() => null);
      if (temporaryMetadata) {
        if (temporaryMetadata.isSymbolicLink() || !temporaryMetadata.isFile()) throw new Error(`안전하지 않은 임시 RAW 파일입니다: ${file.name}`);
        await unlink(temporary);
      }
      await copyFile(file.path, temporary, fsConstants.COPYFILE_EXCL);
      const copiedMetadata = await stat(temporary);
      if (copiedMetadata.size !== file.size) {
        await unlink(temporary).catch(() => undefined);
        throw new Error(`RAW 복사 크기 검증에 실패했습니다: ${file.name}`);
      }
      await utimes(temporary, new Date(), new Date(file.mtimeMs));
      await rename(temporary, destination);
      copied += 1;
      input.onProgress?.({ stage: "COPYING", current: existing.size + copied, total: matches.length, message: `RAW 복사: ${file.name}` });
    }
    input.onProgress?.({ stage: "VERIFYING", current: matches.length, total: matches.length, message: "RAW 매칭 결과와 SSD1 원본 무결성을 확인하고 있습니다." });
    const rawSourceUnchanged = sameSnapshot(rawCollection.snapshot, await collectRawSnapshot(directories.sourceProject));
    if (!rawSourceUnchanged) throw new Error("RAW 매칭 후 SSD1 RAW 원본 무결성 검증에 실패했습니다.");
    for (const file of matches) {
      const destination = path.join(outputDirectory, file.name);
      const metadata = await stat(destination);
      if (metadata.size !== file.size) throw new Error(`RAW 결과 검증에 실패했습니다: ${file.name}`);
    }
    return {
      ok: true, status: "RAW_MATCH_COMPLETED", projectRelativePath: directories.relativePath, selectionSource,
      selectedCount: selected.length, rawFoundCount: rawCollection.files.length, matchedCount: matches.length,
      alreadyCopiedCount: existing.size, missingNames, ambiguousNames: [], rawSourceUnchanged: true,
      outputRelativePath: OUTPUT_DIRECTORY,
    };
  } catch (error) {
    const rawSourceUnchanged = sameSnapshot(rawCollection.snapshot, await collectRawSnapshot(directories.sourceProject).catch(() => new Map()));
    return failure({
      status: "RAW_MATCH_FAILED", projectRelativePath: directories.relativePath, selectionSource, selectedCount: selected.length,
      rawFoundCount: rawCollection.files.length, matchedCount: existing.size + copied, alreadyCopiedCount: existing.size,
      missingNames, ambiguousNames: [], rawSourceUnchanged, outputRelativePath: OUTPUT_DIRECTORY,
      error: error instanceof Error ? error.message : "RAW 매칭 중 오류가 발생했습니다.",
    });
  }
}

export const PHOTO_RAW_MATCH_OUTPUT_DIRECTORY = OUTPUT_DIRECTORY;
