#!/usr/bin/env node

import { loadEnvConfig } from "@next/env";
import { lstat, open, readdir, readFile, realpath } from "node:fs/promises";
import path from "node:path";
import { JPG_INTEGRATED_DIRECTORY } from "@/lib/photo-classifier/node/storageLayout";
import { normalizeRemoteNasRelativePath } from "@/lib/remote-nas/path";
import { resolvePhotoWorkPath } from "@/lib/person-select/sourceRoots";
import { readBridgeMarkFromXmpText } from "@/lib/selectMatch/bridgeRating";
import { isDeliveredRoundFolder } from "@/lib/photo-bridge/rawMatchDelivery";

loadEnvConfig(process.cwd());

const PROGRESS_PREFIX = "OLIVIA_REMOTE_PROGRESS ";

type Rating = {
  key: string;
  name: string;
  rating: number | null;
  colorLabel: 6 | 7 | 8 | 9 | null;
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

async function readEmbeddedMark(filePath: string) {
  const handle = await open(filePath, "r");
  try {
    const buffer = Buffer.alloc(1_048_576);
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    const text = buffer.subarray(0, bytesRead).toString("utf8");
    const start = text.indexOf("<x:xmpmeta");
    if (start === -1) return { rating: null, colorLabel: null };
    const end = text.indexOf("</x:xmpmeta>", start);
    return readBridgeMarkFromXmpText(text.slice(start, end === -1 ? start + 65_536 : end + 12));
  } finally {
    await handle.close();
  }
}

async function readSidecarMark(directory: string, basename: string) {
  for (const suffix of [".xmp", ".XMP"]) {
    const sidecar = path.join(directory, `${basename}${suffix}`);
    const metadata = await lstat(sidecar).catch(() => null);
    if (!metadata) continue;
    if (metadata.isSymbolicLink() || !metadata.isFile()) continue;
    return readBridgeMarkFromXmpText(await readFile(sidecar, "utf8"));
  }
  return { rating: null, colorLabel: null };
}

export async function readPhotoXmpRatings(input: {
  remotePath: string;
  onProgress?: (current: number, total: number, message: string) => void;
}) {
  const remotePath = normalizeRemoteNasRelativePath(input.remotePath);
  if (!remotePath) throw new Error("--remote-path가 필요합니다.");
  const resolved = await resolvePhotoWorkPath(remotePath);
  const canonicalSelected = resolved.canonicalPath;

  const integratedCandidate = path.join(canonicalSelected, JPG_INTEGRATED_DIRECTORY);
  const integratedMetadata = await lstat(integratedCandidate).catch(() => null);
  const selectedFolder = path.basename(canonicalSelected).normalize("NFC") === JPG_INTEGRATED_DIRECTORY
    ? canonicalSelected
    : integratedMetadata?.isDirectory() && !integratedMetadata.isSymbolicLink()
      ? integratedCandidate
      : canonicalSelected;
  const canonicalJpgFolder = await realpath(selectedFolder);
  if (!isInside(resolved.rootPath, canonicalJpgFolder)) throw new Error("선택한 폴더가 SOURCE_ROOT 밖을 가리킵니다.");

  const jpgNames = (await readdir(canonicalJpgFolder, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && !entry.isSymbolicLink() && !entry.name.startsWith(".") && /\.(?:jpe?g|cr2|cr3|arw|nef|nrw|raf|rw2|orf|dng)$/i.test(entry.name))
    .map((entry) => entry.name)
    .sort(natural);
  const files: Array<{ name: string; directory: string; absolutePath: string }> = jpgNames.map((name) => ({
    name,
    directory: canonicalJpgFolder,
    absolutePath: path.join(canonicalJpgFolder, name),
  }));
  const rawRoot = path.basename(canonicalSelected).normalize("NFC") === JPG_INTEGRATED_DIRECTORY
    ? path.dirname(canonicalSelected)
    : canonicalSelected;
  const seenPaths = new Set(files.map((file) => file.absolutePath));
  const collectRaw = async (directory: string, depth: number): Promise<void> => {
    if (depth > 5) return;
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (entry.name.startsWith(".") || entry.isSymbolicLink()) continue;
      const absolutePath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        const normalized = entry.name.normalize("NFC").toLocaleLowerCase("ko-KR");
        if (normalized === "selected_raw" || normalized === "jpg" || normalized === "jpg원본" || normalized === "jpg전체" || isDeliveredRoundFolder(entry.name)) continue;
        await collectRaw(absolutePath, depth + 1);
        continue;
      }
      if (!entry.isFile() || !/\.(?:cr2|cr3|arw|nef|nrw|raf|rw2|orf|dng)$/i.test(entry.name) || seenPaths.has(absolutePath)) continue;
      seenPaths.add(absolutePath);
      files.push({ name: entry.name, directory, absolutePath });
    }
  };
  await collectRaw(rawRoot, 0);
  files.sort((left, right) => natural(left.absolutePath, right.absolutePath));
  const total = files.length;
  const found = new Array<Rating | null>(total).fill(null);
  let cursor = 0;
  let completed = 0;
  input.onProgress?.(0, total, `XMP 별점 0/${total}`);

  const workers = Array.from({ length: Math.min(8, Math.max(1, total)) }, async () => {
    while (true) {
      const index = cursor++;
      if (index >= total) return;
      const { name, directory, absolutePath } = files[index];
      const basename = name.replace(/\.[^.]+$/, "");
      try {
        const sidecar = await readSidecarMark(directory, basename);
        const embedded = sidecar.rating === null && sidecar.colorLabel === null ? await readEmbeddedMark(absolutePath) : { rating: null, colorLabel: null };
        const rating = sidecar.rating ?? embedded.rating;
        const colorLabel = sidecar.colorLabel ?? embedded.colorLabel;
        if (rating !== null || colorLabel !== null) {
          found[index] = {
            key: toKey(name),
            name: name.normalize("NFC"),
            rating,
            colorLabel,
            source: sidecar.rating !== null || sidecar.colorLabel !== null ? "sidecar" : "embedded",
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
  const remotePath = values["remote-path"];
  if (!remotePath) throw new Error("--remote-path가 필요합니다.");
  const result = await readPhotoXmpRatings({ remotePath, onProgress: progress });
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  main().catch((error: unknown) => {
    process.stdout.write(`${JSON.stringify({ ok: false, status: "PHOTO_XMP_RATINGS_FAILED", error: error instanceof Error ? error.message : String(error) })}\n`);
    process.exitCode = 1;
  });
}
