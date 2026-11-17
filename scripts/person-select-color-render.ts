#!/usr/bin/env node

import path from "node:path";
import { readFile } from "node:fs/promises";

import {
  applyPhotoEditRecipe,
  colorMatchSignal,
  mergePhotoEditRecipes,
  skinDifference,
  type PhotoEditRecipe,
  type PhotoMeasurement,
} from "@/lib/photo-edit";
import type { ColorMatchManifest } from "@/lib/photo-edit/manifest";
import { safeColorMatchPathParts, writeColorMatchManifest } from "@/lib/photo-edit/node/colorMatchFiles";
import { createJpegPreview, decodeJpegForPhotoEdit, writeEditedJpeg } from "@/lib/photo-edit/node/jpegAdapter";
import { ensurePersonSelectBucket, PERSON_SELECT_BUCKET } from "@/lib/person-select/server";
import { resolvePersonSelectSourcePath } from "@/lib/person-select/sourceRoots";
import { getSupabaseAdmin } from "@/lib/supabase";

type RecipeChange = { relativePath: string; recipe: PhotoEditRecipe };

function readArgs() {
  const values = process.argv.slice(2);
  const take = (flag: string) => { const index = values.indexOf(flag); return index >= 0 ? values[index + 1] : undefined; };
  const parse = <T>(flag: string): T | undefined => {
    const raw = take(flag);
    return raw ? JSON.parse(raw) as T : undefined;
  };
  return {
    scope: take("--scope") === "photo" ? "photo" as const : "person-select" as const,
    eventId: take("--event-id"),
    outputRelativePath: take("--output-relative-path"),
    changes: parse<RecipeChange[]>("--changes-json") ?? [],
    commonRecipe: parse<PhotoEditRecipe>("--common-recipe-json"),
    targetMeasurement: parse<PhotoMeasurement>("--target-measurement-json"),
  };
}

function report(current: number, total: number, message: string) {
  process.stderr.write(`OLIVIA_REMOTE_PROGRESS ${JSON.stringify({ stage: "COLOR_RENDER", current, total, message })}\n`);
}

async function main() {
  const input = readArgs();
  if (!input.outputRelativePath) throw new Error("색 맞춤 결과 폴더가 필요합니다.");
  if (input.scope === "person-select" && !input.eventId) throw new Error("event_id와 색 맞춤 결과 폴더가 필요합니다.");
  const output = await resolvePersonSelectSourcePath(input.outputRelativePath);
  const manifestPath = path.join(output.canonicalPath, ".olivia-color-match", "recipes.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as ColorMatchManifest;
  if (manifest.manifestVersion !== 1) throw new Error("색 맞춤 레시피 형식이 올바르지 않습니다.");
  if (input.scope === "person-select") {
    if (manifest.eventId !== input.eventId || !manifest.manifestStoragePath.startsWith(`${input.eventId}/color-match/`)) {
      throw new Error("색 맞춤 레시피가 프로젝트와 일치하지 않습니다.");
    }
  } else if (manifest.eventId || !manifest.manifestStoragePath.startsWith("photo-retouch/")) {
    throw new Error("사진보정 앱의 색 맞춤 레시피가 아닙니다.");
  }
  const source = await resolvePersonSelectSourcePath(manifest.sourceVirtualPath);
  const changes = new Map(input.changes.map((change) => [change.relativePath.normalize("NFC"), change.recipe]));
  if (input.commonRecipe) manifest.commonRecipe = input.commonRecipe;
  if (input.targetMeasurement) manifest.targetMeasurement = input.targetMeasurement;
  const targets = input.commonRecipe
    ? manifest.files
    : manifest.files.filter((file) => changes.has(file.relativePath.normalize("NFC")));
  if (!targets.length) throw new Error("저장할 사진 변경값이 없습니다.");
  await ensurePersonSelectBucket();
  const bucket = getSupabaseAdmin().storage.from(PERSON_SELECT_BUCKET);

  for (let index = 0; index < targets.length; index += 1) {
    const file = targets[index];
    const changedRecipe = changes.get(file.relativePath.normalize("NFC"));
    if (changedRecipe) file.recipe = changedRecipe;
    const relativeParts = safeColorMatchPathParts(file.relativePath);
    const previewPrefix = input.scope === "photo" ? "photo-retouch/" : `${input.eventId}/color-match/`;
    if (!file.resultPreviewPath.startsWith(previewPrefix)) throw new Error(`${file.fileName}의 미리보기 경로가 작업과 일치하지 않습니다.`);
    const sourcePath = path.join(source.canonicalPath, ...relativeParts);
    const destinationPath = path.join(output.canonicalPath, ...relativeParts);
    const decoded = await decodeJpegForPhotoEdit(sourcePath);
    const effectiveRecipe = mergePhotoEditRecipes(manifest.commonRecipe, file.recipe);
    const edited = applyPhotoEditRecipe(decoded, effectiveRecipe);
    await writeEditedJpeg(destinationPath, decoded.sourceBytes, edited);
    const preview = await createJpegPreview(destinationPath);
    const upload = await bucket.upload(file.resultPreviewPath, preview, { contentType: "image/jpeg", upsert: true });
    if (upload.error) throw upload.error;
    file.measurementAfter = edited.measurementAfter;
    file.deltaAfter = skinDifference(edited.measurementAfter, manifest.targetMeasurement);
    file.signalAfter = colorMatchSignal(file.deltaAfter);
    file.convertedToSrgb = decoded.convertedToSrgb;
    manifest.updatedAt = new Date().toISOString();
    report(index + 1, targets.length, `저장 · ${file.fileName}`);
  }

  await writeColorMatchManifest(manifest);
  const manifestUpload = await bucket.upload(manifest.manifestStoragePath, Buffer.from(`${JSON.stringify(manifest)}\n`), { contentType: "application/json", upsert: true });
  if (manifestUpload.error) throw manifestUpload.error;
  process.stdout.write(`${JSON.stringify({ ok: true, status: `색 맞춤 저장 ${targets.length}장 완료`, ...(input.eventId ? { eventId: input.eventId } : {}), scope: input.scope, outputVirtualPath: manifest.outputVirtualPath, manifestStoragePath: manifest.manifestStoragePath, renderedCount: targets.length })}\n`);
}

export function colorRenderFailureOutput(error: unknown) {
  return JSON.stringify({ ok: false, error: error instanceof Error ? error.message : "색 맞춤 저장에 실패했습니다.", stage: "color_render" });
}

if (process.env.NODE_ENV !== "test") void main().catch((error) => {
  process.stdout.write(`${colorRenderFailureOutput(error)}\n`);
  process.exitCode = 1;
});
