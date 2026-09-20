import { lstat, readFile, readdir, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { JPG_PHOTO_EXTENSIONS } from "@/lib/photo-classifier/constants";
import type { RunnerProgress, RunnerRoots } from "@/lib/photo-classifier/node/types";
import {
  applyPhotoDuplicates,
  photoRejectReason,
  PHOTO_SELECT_DEFAULT_OPTIONS,
  type PhotoSelectRejectReason,
  type PhotoSelectRuleOptions,
} from "@/lib/photoSelect/analysis";
import { ensureSafeDirectory, extension, isInside, posixRelative, requireSafeDirectory, resolvePhotoWorkProjectDirectory } from "./common";

const DEFAULT_INPUT_DIRECTORY = "씬별분류";
const REPORT_DIRECTORY = "AI_SELECT_REPORT";

type SourcePhoto = { path: string; relativePath: string; scene: string; name: string; size: number; mtimeMs: number };
type AnalyzedPhoto = SourcePhoto & {
  blurScore: number;
  brightness: number;
  hash: string;
  rejectReason: PhotoSelectRejectReason;
  dupGroupId: string | null;
  isDupRep: boolean;
  selected: boolean;
};

export type PhotoAiSelectInput = {
  projectRelativePath: string;
  inputRelativePath?: string;
  options?: Partial<PhotoSelectRuleOptions>;
  roots?: RunnerRoots;
  onProgress?: (progress: RunnerProgress) => void;
};

export type PhotoAiSelectResult = {
  ok: boolean;
  status: "AI_SELECT_COMPLETED" | "REVIEW_REQUIRED" | "AI_SELECT_FAILED";
  projectRelativePath: string;
  inputRelativePath: string;
  reportRelativePath: string;
  totalCount: number;
  selectedCount: number;
  rejectedCount: number;
  duplicateRemovedCount: number;
  sourceUnchanged: boolean;
  options: PhotoSelectRuleOptions;
  error?: string;
};

function validateSubpath(value: string): string {
  if (!value || value.includes("\0") || value.includes("\\") || value.startsWith("/") || path.isAbsolute(value)) throw new Error("AI 셀렉 입력은 프로젝트 기준 상대경로여야 합니다.");
  const segments = value.split("/");
  if (segments.some((segment) => !segment || segment === "." || segment === "..")) throw new Error("AI 셀렉 입력 경로가 올바르지 않습니다.");
  return segments.join("/");
}

function resolveOptions(input: Partial<PhotoSelectRuleOptions> | undefined): PhotoSelectRuleOptions {
  const supplied = Object.fromEntries(Object.entries(input ?? {}).filter(([, value]) => value !== undefined)) as Partial<PhotoSelectRuleOptions>;
  const options = { ...PHOTO_SELECT_DEFAULT_OPTIONS, ...supplied };
  if (!Number.isFinite(options.blurThreshold) || options.blurThreshold < 0) throw new Error("blurThreshold가 올바르지 않습니다.");
  if (!Number.isFinite(options.darkThreshold) || options.darkThreshold < 0 || options.darkThreshold > 255) throw new Error("darkThreshold가 올바르지 않습니다.");
  if (!Number.isFinite(options.overexpThreshold) || options.overexpThreshold < 0 || options.overexpThreshold > 255) throw new Error("overexpThreshold가 올바르지 않습니다.");
  if (!Number.isFinite(options.dupThreshold) || options.dupThreshold < 0 || options.dupThreshold > 100) throw new Error("dupThreshold가 올바르지 않습니다.");
  return options;
}

async function collectPhotos(inputDirectory: string): Promise<SourcePhoto[]> {
  const photos: SourcePhoto[] = [];
  const visit = async (directory: string): Promise<void> => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const fullPath = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) throw new Error(`AI 셀렉 입력에 심볼릭 링크가 있습니다: ${posixRelative(inputDirectory, fullPath)}`);
      if (entry.isDirectory()) {
        if (directory === inputDirectory && (entry.name === REPORT_DIRECTORY || entry.name === ".olivia" || /^\d+px_Q\d+$/.test(entry.name))) continue;
        await visit(fullPath);
        continue;
      }
      if (!entry.isFile() || !JPG_PHOTO_EXTENSIONS.has(extension(entry.name))) continue;
      const metadata = await stat(fullPath);
      const relativePath = posixRelative(inputDirectory, fullPath);
      photos.push({ path: fullPath, relativePath, scene: path.posix.dirname(relativePath) === "." ? "ROOT" : path.posix.dirname(relativePath), name: entry.name, size: metadata.size, mtimeMs: metadata.mtimeMs });
    }
  };
  await visit(inputDirectory);
  return photos.sort((left, right) => left.relativePath.localeCompare(right.relativePath, "en", { numeric: true, sensitivity: "base" }));
}

function sameSnapshot(before: SourcePhoto[], after: SourcePhoto[]): boolean {
  return before.length === after.length && before.every((file, index) => {
    const current = after[index];
    return current?.relativePath === file.relativePath && current.size === file.size && current.mtimeMs === file.mtimeMs;
  });
}

function grayscale(rgb: Buffer, channels: number): Float32Array {
  const count = Math.floor(rgb.length / channels);
  const values = new Float32Array(count);
  for (let index = 0; index < count; index += 1) {
    const offset = index * channels;
    values[index] = 0.299 * rgb[offset] + 0.587 * rgb[offset + 1] + 0.114 * rgb[offset + 2];
  }
  return values;
}

async function analyzePhoto(filePath: string): Promise<{ blurScore: number; brightness: number; hash: string }> {
  const metadata = await sharp(filePath).rotate().metadata();
  const width = metadata.width ?? 1;
  const height = metadata.height ?? 1;
  const scale = Math.min(280 / width, 280 / height, 1);
  const resizedWidth = Math.max(1, Math.round(width * scale));
  const resizedHeight = Math.max(1, Math.round(height * scale));
  const { data, info } = await sharp(filePath).rotate().resize(resizedWidth, resizedHeight, { fit: "fill" }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const gray = grayscale(data, info.channels);
  let brightnessTotal = 0;
  for (const value of gray) brightnessTotal += value;
  const brightness = gray.length ? brightnessTotal / gray.length : 0;
  let laplacianTotal = 0;
  let laplacianCount = 0;
  for (let y = 1; y < info.height - 1; y += 1) {
    for (let x = 1; x < info.width - 1; x += 1) {
      const center = y * info.width + x;
      const laplacian = gray[center] * 4 - gray[(y - 1) * info.width + x] - gray[(y + 1) * info.width + x] - gray[y * info.width + x - 1] - gray[y * info.width + x + 1];
      laplacianTotal += laplacian * laplacian;
      laplacianCount += 1;
    }
  }
  const blurScore = laplacianCount ? Math.sqrt(laplacianTotal / laplacianCount) : 0;
  const hashImage = await sharp(filePath).rotate().resize(8, 8, { fit: "fill" }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const hashGray = grayscale(hashImage.data, hashImage.info.channels);
  let hashTotal = 0;
  for (const value of hashGray) hashTotal += value;
  const mean = hashGray.length ? hashTotal / hashGray.length : 0;
  const hash = [...hashGray].map((value) => value >= mean ? "1" : "0").join("");
  return { blurScore, brightness, hash };
}

function csvCell(value: unknown): string {
  const stringValue = String(value ?? "");
  return /[",\n]/.test(stringValue) ? `"${stringValue.replaceAll('"', '""')}"` : stringValue;
}

function toCsv(rows: unknown[][]): string {
  return `\uFEFF${rows.map((row) => row.map(csvCell).join(",")).join("\n")}\n`;
}

export async function runPhotoAiSelect(input: PhotoAiSelectInput): Promise<PhotoAiSelectResult> {
  const options = resolveOptions(input.options);
  const inputRelativePath = validateSubpath(input.inputRelativePath ?? DEFAULT_INPUT_DIRECTORY);
  const directories = await resolvePhotoWorkProjectDirectory({ projectRelativePath: input.projectRelativePath, roots: input.roots });
  const inputCandidate = path.resolve(directories.workProject, ...inputRelativePath.split("/"));
  if (!isInside(directories.workProject, inputCandidate)) throw new Error("AI 셀렉 입력이 SSD2 프로젝트 밖을 가리킵니다.");
  const inputDirectory = await requireSafeDirectory(inputCandidate, "AI 셀렉 입력 폴더");
  const reportDirectory = path.join(directories.workProject, REPORT_DIRECTORY);
  const reportRelativePath = REPORT_DIRECTORY;
  const manifestPath = path.join(reportDirectory, "selection-manifest.json");
  const sourceBefore = await collectPhotos(inputDirectory);
  if (!sourceBefore.length) {
    return { ok: false, status: "REVIEW_REQUIRED", projectRelativePath: directories.relativePath, inputRelativePath, reportRelativePath, totalCount: 0, selectedCount: 0, rejectedCount: 0, duplicateRemovedCount: 0, sourceUnchanged: true, options, error: "AI 셀렉할 JPG/JPEG가 없습니다." };
  }
  const existingManifest = await lstat(manifestPath).catch(() => null);
  if (existingManifest) {
    if (existingManifest.isSymbolicLink() || !existingManifest.isFile()) return { ok: false, status: "REVIEW_REQUIRED", projectRelativePath: directories.relativePath, inputRelativePath, reportRelativePath, totalCount: sourceBefore.length, selectedCount: 0, rejectedCount: 0, duplicateRemovedCount: 0, sourceUnchanged: true, options, error: "기존 AI 셀렉 manifest가 안전하지 않습니다." };
    const existing = JSON.parse(await readFile(manifestPath, "utf8")) as Record<string, unknown>;
    const existingPaths = Array.isArray(existing.photos)
      ? existing.photos.map((photo) => photo && typeof photo === "object" ? (photo as Record<string, unknown>).relativePath : null)
      : [];
    const sameInputs = existingPaths.length === sourceBefore.length && existingPaths.every((relativePath, index) => relativePath === sourceBefore[index].relativePath);
    const sameOptions = JSON.stringify(existing.options) === JSON.stringify(options);
    if (existing.totalCount === sourceBefore.length && existing.status === "AI_SELECT_COMPLETED" && sameInputs && sameOptions) {
      return { ok: true, status: "AI_SELECT_COMPLETED", projectRelativePath: directories.relativePath, inputRelativePath, reportRelativePath, totalCount: sourceBefore.length, selectedCount: Number(existing.selectedCount) || 0, rejectedCount: Number(existing.rejectedCount) || 0, duplicateRemovedCount: Number(existing.duplicateRemovedCount) || 0, sourceUnchanged: true, options };
    }
    return { ok: false, status: "REVIEW_REQUIRED", projectRelativePath: directories.relativePath, inputRelativePath, reportRelativePath, totalCount: sourceBefore.length, selectedCount: 0, rejectedCount: 0, duplicateRemovedCount: 0, sourceUnchanged: true, options, error: "기존 AI 셀렉 결과가 현재 입력과 일치하지 않습니다." };
  }

  input.onProgress?.({ stage: "ANALYZING", current: 0, total: sourceBefore.length, message: "기존 품질·중복 규칙으로 JPG를 분석하고 있습니다." });
  const analyzed: AnalyzedPhoto[] = [];
  try {
    for (const photo of sourceBefore) {
      const metrics = await analyzePhoto(photo.path);
      const rejectReason = photoRejectReason(metrics, options);
      analyzed.push({ ...photo, ...metrics, rejectReason, dupGroupId: null, isDupRep: false, selected: rejectReason === "ok" });
      input.onProgress?.({ stage: "ANALYZING", current: analyzed.length, total: sourceBefore.length, message: `AI 셀렉 분석: ${photo.relativePath}` });
    }
    const byScene = new Map<string, AnalyzedPhoto[]>();
    for (const photo of analyzed) byScene.set(photo.scene, [...(byScene.get(photo.scene) ?? []), photo]);
    const finalPhotos: AnalyzedPhoto[] = [];
    for (const photos of byScene.values()) {
      const withDuplicates = options.dupRemoval ? applyPhotoDuplicates(photos, options.dupThreshold) : photos;
      finalPhotos.push(...withDuplicates.map((photo) => ({ ...photo, selected: photo.rejectReason === "ok" && (photo.dupGroupId === null || photo.isDupRep) })));
    }
    finalPhotos.sort((left, right) => left.relativePath.localeCompare(right.relativePath, "en", { numeric: true, sensitivity: "base" }));
    const selectedCount = finalPhotos.filter((photo) => photo.selected).length;
    const rejectedCount = finalPhotos.filter((photo) => photo.rejectReason !== "ok").length;
    const duplicateRemovedCount = finalPhotos.filter((photo) => photo.dupGroupId !== null && !photo.isDupRep).length;
    const sourceUnchanged = sameSnapshot(sourceBefore, await collectPhotos(inputDirectory));
    if (!sourceUnchanged) throw new Error("AI 셀렉 분석 후 SSD2 JPG 원본이 변경되었습니다.");
    input.onProgress?.({ stage: "VERIFYING", current: sourceBefore.length, total: sourceBefore.length, message: "AI 셀렉 manifest와 원본 불변 상태를 확인하고 있습니다." });
    await ensureSafeDirectory(directories.workRoot, reportDirectory);
    const manifest = {
      status: "AI_SELECT_COMPLETED", projectRelativePath: directories.relativePath, inputRelativePath,
      totalCount: finalPhotos.length, selectedCount, rejectedCount, duplicateRemovedCount, options,
      sourceUnchanged, completedAt: new Date().toISOString(),
      photos: finalPhotos.map((photo) => ({
        relativePath: photo.relativePath, scene: photo.scene, name: photo.name, size: photo.size,
        blurScore: Number(photo.blurScore.toFixed(4)), brightness: Number(photo.brightness.toFixed(4)), hash: photo.hash,
        rejectReason: photo.rejectReason, duplicateGroup: photo.dupGroupId, representative: photo.isDupRep, selected: photo.selected,
      })),
    };
    const csvPath = path.join(reportDirectory, "selected_jpg_list.csv");
    const temporaryCsv = path.join(reportDirectory, ".selected_jpg_list.csv.tmp");
    await writeFile(temporaryCsv, toCsv([
      ["scene", "jpg", "blur", "brightness", "reject_reason", "duplicate_group", "representative", "selected"],
      ...finalPhotos.map((photo) => [photo.scene, photo.name, photo.blurScore.toFixed(2), photo.brightness.toFixed(1), photo.rejectReason, photo.dupGroupId ?? "", photo.isDupRep ? "Y" : "", photo.selected ? "Y" : ""]),
    ]), { flag: "wx" });
    await rename(temporaryCsv, csvPath);
    // manifest를 마지막에 확정한다. manifest가 있으면 전체 결과가 완성됐다는 뜻이다.
    const temporaryManifest = path.join(reportDirectory, ".selection-manifest.json.tmp");
    await writeFile(temporaryManifest, `${JSON.stringify(manifest, null, 2)}\n`, { flag: "wx" });
    await rename(temporaryManifest, manifestPath);
    return { ok: true, status: "AI_SELECT_COMPLETED", projectRelativePath: directories.relativePath, inputRelativePath, reportRelativePath, totalCount: finalPhotos.length, selectedCount, rejectedCount, duplicateRemovedCount, sourceUnchanged, options };
  } catch (error) {
    return { ok: false, status: "AI_SELECT_FAILED", projectRelativePath: directories.relativePath, inputRelativePath, reportRelativePath, totalCount: sourceBefore.length, selectedCount: 0, rejectedCount: 0, duplicateRemovedCount: 0, sourceUnchanged: sameSnapshot(sourceBefore, await collectPhotos(inputDirectory).catch(() => [])), options, error: error instanceof Error ? error.message : "AI 셀렉 분석 중 오류가 발생했습니다." };
  }
}

export const PHOTO_AI_SELECT_DEFAULT_INPUT = DEFAULT_INPUT_DIRECTORY;
export const PHOTO_AI_SELECT_REPORT_DIRECTORY = REPORT_DIRECTORY;
