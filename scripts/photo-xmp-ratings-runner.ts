#!/usr/bin/env node

import { loadEnvConfig } from "@next/env";
import { lstat, open, readdir, readFile, realpath } from "node:fs/promises";
import path from "node:path";
import { JPG_INTEGRATED_DIRECTORY } from "@/lib/photo-classifier/node/storageLayout";
import { normalizeRemoteNasRelativePath } from "@/lib/remote-nas/path";
import { readRatingFromXmpText } from "@/lib/selectMatch/bridgeRating";

loadEnvConfig(process.cwd());

const PROGRESS_PREFIX = "OLIVIA_REMOTE_PROGRESS ";

type Rating = {
  key: string;
  name: string;
  rating: number;
  source: "sidecar" | "embedded";
};

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

function toKey(name: string) {
  return name.replace(/\.[^.]+$/, "").normalize("NFC").toLocaleLowerCase("en-US");
}

async function readEmbeddedRating(filePath: string): Promise<number | null> {
  const handle = await open(filePath, "r");
  try {
    const buffer = Buffer.alloc(1_048_576);
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    const text = buffer.subarray(0, bytesRead).toString("utf8");
    const start = text.indexOf("<x:xmpmeta");
    if (start === -1) return null;
    const end = text.indexOf("</x:xmpmeta>", start);
    return readRatingFromXmpText(text.slice(start, end === -1 ? start + 65_536 : end + 12));
  } finally {
    await handle.close();
  }
}

async function readSidecarRating(directory: string, basename: string): Promise<number | null> {
  for (const suffix of [".xmp", ".XMP"]) {
    const sidecar = path.join(directory, `${basename}${suffix}`);
    const metadata = await lstat(sidecar).catch(() => null);
    if (!metadata) continue;
    if (metadata.isSymbolicLink() || !metadata.isFile()) continue;
    return readRatingFromXmpText(await readFile(sidecar, "utf8"));
  }
  return null;
}

export async function readPhotoXmpRatings(input: {
  sourceRoot: string;
  remotePath: string;
  onProgress?: (current: number, total: number, message: string) => void;
}) {
  const sourceRoot = await realpath(input.sourceRoot);
  const remotePath = normalizeRemoteNasRelativePath(input.remotePath);
  if (!remotePath) throw new Error("--remote-path가 필요합니다.");
  const selected = path.resolve(sourceRoot, ...remotePath.split("/").filter(Boolean));
  if (!isInside(sourceRoot, selected)) throw new Error("PHOTO_XMP_RATINGS 경로가 SOURCE_ROOT 밖입니다.");
  const selectedMetadata = await lstat(selected);
  if (selectedMetadata.isSymbolicLink() || !selectedMetadata.isDirectory()) throw new Error("선택한 경로가 안전한 폴더가 아닙니다.");
  const canonicalSelected = await realpath(selected);
  if (!isInside(sourceRoot, canonicalSelected)) throw new Error("PHOTO_XMP_RATINGS 경로가 SOURCE_ROOT 밖을 가리킵니다.");

  const jpgFolder = path.basename(canonicalSelected).normalize("NFC") === JPG_INTEGRATED_DIRECTORY
    ? canonicalSelected
    : path.join(canonicalSelected, JPG_INTEGRATED_DIRECTORY);
  const jpgMetadata = await lstat(jpgFolder);
  if (jpgMetadata.isSymbolicLink() || !jpgMetadata.isDirectory()) throw new Error(`${JPG_INTEGRATED_DIRECTORY} 폴더를 찾을 수 없습니다.`);
  const canonicalJpgFolder = await realpath(jpgFolder);
  if (!isInside(sourceRoot, canonicalJpgFolder)) throw new Error(`${JPG_INTEGRATED_DIRECTORY} 폴더가 SOURCE_ROOT 밖을 가리킵니다.`);

  const names = (await readdir(canonicalJpgFolder, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && !entry.isSymbolicLink() && !entry.name.startsWith(".") && /\.(?:jpe?g)$/i.test(entry.name))
    .map((entry) => entry.name)
    .sort(natural);
  const total = names.length;
  const found = new Array<Rating | null>(total).fill(null);
  let cursor = 0;
  let completed = 0;
  input.onProgress?.(0, total, `XMP 별점 0/${total}`);

  const workers = Array.from({ length: Math.min(8, Math.max(1, total)) }, async () => {
    while (true) {
      const index = cursor++;
      if (index >= total) return;
      const name = names[index];
      const absolutePath = path.join(canonicalJpgFolder, name);
      const basename = name.replace(/\.[^.]+$/, "");
      try {
        const sidecarRating = await readSidecarRating(canonicalJpgFolder, basename);
        const rating = sidecarRating ?? await readEmbeddedRating(absolutePath);
        if (rating !== null && Number.isInteger(rating) && rating >= 1 && rating <= 5) {
          found[index] = {
            key: toKey(name),
            name: name.normalize("NFC"),
            rating,
            source: sidecarRating !== null ? "sidecar" : "embedded",
          };
        }
      } catch {
        // Adobe Bridge가 파일을 갱신하는 순간 잠시 읽을 수 없는 항목은 건너뛴다.
      }
      completed += 1;
      input.onProgress?.(completed, total, `XMP 별점 ${completed}/${total}`);
    }
  });
  await Promise.all(workers);

  const ratings = found.filter((item): item is Rating => item !== null);
  return { ok: true as const, folder: remotePath, ratings, scanned: total, rated: ratings.length };
}

async function main() {
  const values = args();
  const sourceRoot = process.env.SOURCE_ROOT?.trim() || process.env.OLIVIA_PHOTO_SOURCE_ROOT?.trim();
  if (!sourceRoot) throw new Error("SOURCE_ROOT 또는 OLIVIA_PHOTO_SOURCE_ROOT가 설정되어 있지 않습니다.");
  const remotePath = values["remote-path"];
  if (!remotePath) throw new Error("--remote-path가 필요합니다.");
  const result = await readPhotoXmpRatings({ sourceRoot, remotePath, onProgress: progress });
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  main().catch((error: unknown) => {
    process.stdout.write(`${JSON.stringify({ ok: false, status: "PHOTO_XMP_RATINGS_FAILED", error: error instanceof Error ? error.message : String(error) })}\n`);
    process.exitCode = 1;
  });
}
