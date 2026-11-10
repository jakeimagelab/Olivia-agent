#!/usr/bin/env node

import { loadEnvConfig } from "@next/env";
import { lstat, readdir, realpath, stat } from "node:fs/promises";
import path from "node:path";
import { parse as parseExif } from "exifr";
import sharp from "sharp";
import { JPG_INTEGRATED_DIRECTORY } from "@/lib/photo-classifier/node/storageLayout";
import { normalizeRemoteNasRelativePath } from "@/lib/remote-nas/path";
import { resolvePhotoWorkPath } from "@/lib/person-select/sourceRoots";

loadEnvConfig(process.cwd());

const PROGRESS_PREFIX = "OLIVIA_REMOTE_PROGRESS ";
const MAX_PAGE_SIZE = 400;

type Thumb = {
  relativePath: string;
  name: string;
  size: number;
  lastModified: number;
  captureTimestamp: number;
  timestampSource: "datetime_original" | "create_date" | "ifd_datetime" | "mtime";
  dataUrl: string;
};

function timestamp(value: unknown): number | null {
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value.getTime() : null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string" || !value.trim()) return null;
  const parsed = Date.parse(value.replace(/^(\d{4}):(\d{2}):(\d{2}) /u, "$1-$2-$3T"));
  return Number.isFinite(parsed) ? parsed : null;
}

async function captureMetadata(absolutePath: string, fallback: number): Promise<{
  captureTimestamp: number;
  timestampSource: Thumb["timestampSource"];
}> {
  try {
    const exif = await parseExif(absolutePath, ["DateTimeOriginal", "CreateDate", "ModifyDate"]) as Record<string, unknown> | undefined;
    const original = timestamp(exif?.DateTimeOriginal);
    if (original !== null) return { captureTimestamp: original, timestampSource: "datetime_original" };
    const created = timestamp(exif?.CreateDate);
    if (created !== null) return { captureTimestamp: created, timestampSource: "create_date" };
    const modified = timestamp(exif?.ModifyDate);
    if (modified !== null) return { captureTimestamp: modified, timestampSource: "ifd_datetime" };
  } catch {
    // EXIF가 없거나 손상된 사진은 파일 수정시각으로 안정적으로 정렬한다.
  }
  return { captureTimestamp: fallback, timestampSource: "mtime" };
}

function args(): Record<string, string> {
  const values: Record<string, string> = {};
  for (let index = 2; index < process.argv.length; index += 1) {
    const key = process.argv[index];
    if (!key.startsWith("--")) throw new Error(`알 수 없는 인자입니다: ${key}`);
    const name = key.slice(2);
    const value = process.argv[index + 1];
    values[name] = value && !value.startsWith("--") ? (index += 1, value) : "true";
  }
  return values;
}

function positiveInteger(value: string | undefined, fallback: number, max: number) {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > max) throw new Error("썸네일 범위가 올바르지 않습니다.");
  return parsed;
}

function isInside(root: string, candidate: string) {
  const relative = path.relative(root, candidate);
  return relative === "" || (relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}

function natural(left: string, right: string) {
  return left.localeCompare(right, "ko", { numeric: true, sensitivity: "base" });
}

function progress(current: number, total: number, message: string) {
  process.stderr.write(`${PROGRESS_PREFIX}${JSON.stringify({ stage: "SCANNING", current, total, message })}\n`);
}

export async function createPhotoThumbPage(input: {
  remotePath: string;
  offset?: number;
  maxCount?: number;
  onProgress?: (current: number, total: number, message: string) => void;
}) {
  const remotePath = normalizeRemoteNasRelativePath(input.remotePath);
  if (!remotePath) throw new Error("--remote-path가 필요합니다.");
  const resolved = await resolvePhotoWorkPath(remotePath);
  const canonicalSelected = resolved.canonicalPath;

  const jpgFolder = path.basename(canonicalSelected).normalize("NFC") === JPG_INTEGRATED_DIRECTORY
    ? canonicalSelected
    : path.join(canonicalSelected, JPG_INTEGRATED_DIRECTORY);
  const jpgMetadata = await lstat(jpgFolder);
  if (jpgMetadata.isSymbolicLink() || !jpgMetadata.isDirectory()) throw new Error(`${JPG_INTEGRATED_DIRECTORY} 폴더를 찾을 수 없습니다.`);
  const canonicalJpgFolder = await realpath(jpgFolder);
  if (!isInside(resolved.rootPath, canonicalJpgFolder)) throw new Error(`${JPG_INTEGRATED_DIRECTORY} 폴더가 SOURCE_ROOT 밖을 가리킵니다.`);

  const names = (await readdir(canonicalJpgFolder, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && !entry.isSymbolicLink() && !entry.name.startsWith(".") && /\.(?:jpe?g)$/i.test(entry.name))
    .map((entry) => entry.name)
    .sort(natural);
  const total = names.length;
  const offset = Math.min(positiveInteger(String(input.offset ?? 0), 0, 100_000), total);
  const maxCount = Math.min(MAX_PAGE_SIZE, Math.max(1, positiveInteger(String(input.maxCount ?? MAX_PAGE_SIZE), MAX_PAGE_SIZE, MAX_PAGE_SIZE)));
  const page = names.slice(offset, offset + maxCount);
  const thumbs = new Array<Thumb>(page.length);
  let cursor = 0;
  let completed = 0;
  input.onProgress?.(offset, total, `썸네일 ${offset}/${total}`);

  const workers = Array.from({ length: Math.min(4, Math.max(1, page.length)) }, async () => {
    while (true) {
      const index = cursor++;
      if (index >= page.length) return;
      const name = page[index];
      const absolutePath = path.join(canonicalJpgFolder, name);
      const metadata = await stat(absolutePath);
      const [buffer, captured] = await Promise.all([
        sharp(absolutePath, { failOn: "none" })
          .rotate()
          .resize({ width: 320, height: 320, fit: "inside", withoutEnlargement: true })
          .jpeg({ quality: 60 })
          .toBuffer(),
        captureMetadata(absolutePath, metadata.mtimeMs),
      ]);
      const normalizedName = name.normalize("NFC");
      thumbs[index] = {
        relativePath: normalizedName,
        name: normalizedName,
        size: metadata.size,
        lastModified: metadata.mtimeMs,
        ...captured,
        dataUrl: `data:image/jpeg;base64,${buffer.toString("base64")}`,
      };
      completed += 1;
      input.onProgress?.(offset + completed, total, `썸네일 ${offset + completed}/${total}`);
    }
  });
  await Promise.all(workers);
  return { ok: true as const, folder: remotePath, thumbs, total };
}

async function main() {
  const values = args();
  const remotePath = values["remote-path"];
  if (!remotePath) throw new Error("--remote-path가 필요합니다.");
  const result = await createPhotoThumbPage({
    remotePath,
    offset: positiveInteger(values.offset, 0, 100_000),
    maxCount: positiveInteger(values["max-count"], MAX_PAGE_SIZE, MAX_PAGE_SIZE),
    onProgress: progress,
  });
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  main().catch((error: unknown) => {
    process.stdout.write(`${JSON.stringify({ ok: false, status: "PHOTO_THUMBS_FAILED", error: error instanceof Error ? error.message : String(error) })}\n`);
    process.exitCode = 1;
  });
}
