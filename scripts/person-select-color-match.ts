#!/usr/bin/env node

import path from "node:path";
import { createHash, randomUUID } from "node:crypto";

import {
  applyPhotoEditRecipe,
  clonePhotoEditRecipe,
  colorMatchSignal,
  createPhotoEditMasks,
  deriveAutomaticRecipe,
  measurePhoto,
  medianPhotoMeasurement,
  skinDifference,
  type PhotoMeasurement,
} from "@/lib/photo-edit";
import type { ColorMatchFileManifest, ColorMatchManifest, ColorMatchTargetMode } from "@/lib/photo-edit/manifest";
import { colorMatchVirtualPath, reserveColorMatchOutputFolder, scanColorMatchJpegs, writeColorMatchManifest } from "@/lib/photo-edit/node/colorMatchFiles";
import { createJpegPreview, decodeJpegForPhotoEdit, writeEditedJpeg } from "@/lib/photo-edit/node/jpegAdapter";
import { ensurePersonSelectBucket, PERSON_SELECT_BUCKET } from "@/lib/person-select/server";
import { resolvePersonSelectSourcePath } from "@/lib/person-select/sourceRoots";
import { getSupabaseAdmin } from "@/lib/supabase";

function readArgs() {
  const values = process.argv.slice(2);
  const take = (flag: string) => { const index = values.indexOf(flag); return index >= 0 ? values[index + 1] : undefined; };
  const boolean = (flag: string, fallback: boolean) => {
    const value = take(flag);
    return value === undefined ? fallback : value === "true";
  };
  return {
    eventId: take("--event-id"),
    sourceRelativePath: take("--source-relative-path"),
    brightness: boolean("--brightness", true),
    skinTone: boolean("--skin-tone", true),
    targetMode: (take("--target-mode") || "median") as ColorMatchTargetMode,
    referenceFile: take("--reference-file") || null,
  };
}

function report(current: number, total: number, message: string) {
  process.stderr.write(`OLIVIA_REMOTE_PROGRESS ${JSON.stringify({ stage: "COLOR_MATCH", current, total, message })}\n`);
}

function summary(files: ColorMatchFileManifest[]) {
  return files.reduce((current, file) => {
    current.total += 1;
    if (file.signalAfter === "pass") current.pass += 1;
    else if (file.signalAfter === "check") current.check += 1;
    else if (file.signalAfter === "review") current.review += 1;
    else current.noSkin += 1;
    return current;
  }, { total: 0, pass: 0, check: 0, review: 0, noSkin: 0 });
}

async function main() {
  const input = readArgs();
  if (!input.eventId || !input.sourceRelativePath) throw new Error("event_id와 보정본 폴더가 필요합니다.");
  if (input.targetMode !== "median" && input.targetMode !== "reference") throw new Error("색 맞춤 기준이 올바르지 않습니다.");
  const source = await resolvePersonSelectSourcePath(input.sourceRelativePath);
  const candidates = await scanColorMatchJpegs(source.canonicalPath);
  if (!candidates.length) throw new Error("선택한 폴더에 JPG/JPEG 보정본이 없습니다.");
  const outputPath = await reserveColorMatchOutputFolder(source.canonicalPath);
  const outputVirtualPath = colorMatchVirtualPath(source.root, outputPath);
  const runId = randomUUID();
  const measurements = new Map<string, PhotoMeasurement>();
  const total = candidates.length * 2;

  for (let index = 0; index < candidates.length; index += 1) {
    const candidate = candidates[index];
    const decoded = await decodeJpegForPhotoEdit(candidate.absolutePath);
    const masks = createPhotoEditMasks(decoded);
    measurements.set(candidate.relativePath, measurePhoto(decoded, masks));
    report(index + 1, total, `측정 · ${candidate.fileName}`);
  }

  const available = candidates.map((candidate) => measurements.get(candidate.relativePath)!).filter(Boolean);
  let targetMeasurement = medianPhotoMeasurement(available);
  if (input.targetMode === "reference") {
    const normalizedReference = input.referenceFile?.replace(/\\/gu, "/").normalize("NFC") ?? "";
    const reference = candidates.find((candidate) => candidate.relativePath.normalize("NFC") === normalizedReference || candidate.fileName.normalize("NFC") === normalizedReference);
    if (!reference) throw new Error("기준 사진을 찾을 수 없습니다.");
    targetMeasurement = measurements.get(reference.relativePath)!;
  }

  const db = getSupabaseAdmin();
  await ensurePersonSelectBucket();
  const bucket = db.storage.from(PERSON_SELECT_BUCKET);
  const files: ColorMatchFileManifest[] = [];
  for (let index = 0; index < candidates.length; index += 1) {
    const candidate = candidates[index];
    const decoded = await decodeJpegForPhotoEdit(candidate.absolutePath);
    const measurementBefore = measurements.get(candidate.relativePath)!;
    const recipe = deriveAutomaticRecipe(measurementBefore, targetMeasurement, {
      brightness: input.brightness,
      skinTone: input.skinTone,
    });
    const edited = applyPhotoEditRecipe(decoded, recipe);
    const destination = path.join(outputPath, ...candidate.relativePath.split("/"));
    await writeEditedJpeg(destination, decoded.sourceBytes, edited);
    const previewKey = createHash("sha1").update(candidate.relativePath.normalize("NFC")).digest("hex").slice(0, 20);
    const sourcePreviewPath = `${input.eventId}/color-match/${runId}/source/${previewKey}.jpg`;
    const resultPreviewPath = `${input.eventId}/color-match/${runId}/result/${previewKey}.jpg`;
    const [sourcePreview, resultPreview] = await Promise.all([
      createJpegPreview(candidate.absolutePath),
      createJpegPreview(destination),
    ]);
    const [sourceUpload, resultUpload] = await Promise.all([
      bucket.upload(sourcePreviewPath, sourcePreview, { contentType: "image/jpeg", upsert: true }),
      bucket.upload(resultPreviewPath, resultPreview, { contentType: "image/jpeg", upsert: true }),
    ]);
    if (sourceUpload.error || resultUpload.error) throw sourceUpload.error || resultUpload.error;
    const deltaBefore = skinDifference(measurementBefore, targetMeasurement);
    const deltaAfter = skinDifference(edited.measurementAfter, targetMeasurement);
    files.push({
      relativePath: candidate.relativePath,
      fileName: candidate.fileName,
      recipe,
      measurementBefore,
      measurementAfter: edited.measurementAfter,
      deltaBefore,
      deltaAfter,
      signalBefore: colorMatchSignal(deltaBefore),
      signalAfter: colorMatchSignal(deltaAfter),
      sourcePreviewPath,
      resultPreviewPath,
      convertedToSrgb: decoded.convertedToSrgb,
      exif: decoded.exif,
    });
    report(candidates.length + index + 1, total, `저장 · ${candidate.fileName}`);
  }

  const createdAt = new Date().toISOString();
  const manifestStoragePath = `${input.eventId}/color-match/${runId}/recipes.json`;
  const manifest: ColorMatchManifest = {
    manifestVersion: 1,
    runId,
    manifestStoragePath,
    eventId: input.eventId,
    createdAt,
    updatedAt: createdAt,
    sourcePath: source.canonicalPath,
    sourceVirtualPath: input.sourceRelativePath,
    outputPath,
    outputVirtualPath,
    targetMode: input.targetMode,
    referenceFile: input.referenceFile,
    targetMeasurement,
    commonRecipe: clonePhotoEditRecipe(),
    options: { brightness: input.brightness, skinTone: input.skinTone },
    files,
  };
  await writeColorMatchManifest(manifest);
  const manifestUpload = await bucket.upload(manifestStoragePath, Buffer.from(`${JSON.stringify(manifest)}\n`), { contentType: "application/json", upsert: true });
  if (manifestUpload.error) throw manifestUpload.error;
  const result = {
    ok: true,
    status: `색 맞춤 ${files.length.toLocaleString()}장 완료`,
    eventId: input.eventId,
    outputPath,
    outputVirtualPath,
    manifestStoragePath,
    runId,
    summary: summary(files),
    convertedToSrgb: files.filter((file) => file.convertedToSrgb).length,
  };
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

export function colorMatchFailureOutput(error: unknown) {
  return JSON.stringify({ ok: false, error: error instanceof Error ? error.message : "색 맞춤에 실패했습니다.", stage: "color_match" });
}

if (process.env.NODE_ENV !== "test") void main().catch((error) => {
  process.stdout.write(`${colorMatchFailureOutput(error)}\n`);
  process.exitCode = 1;
});
