import { parsePhotoEditRecipe, parsePhotoMeasurement } from "@/lib/photo-edit/recipeValidation";

import type { RemoteJobAction } from "./requestValidation";
import { safePersonSelectSourcePath } from "./requestValidation";

type RemoteJobPayload = Record<string, unknown>;

function optionalSafePath(value: unknown): string | undefined {
  return value === undefined || value === null || value === ""
    ? undefined
    : safePersonSelectSourcePath(value);
}

function safeRelativeSelection(value: unknown): string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length > 5_000) {
    throw new Error("선택 사진은 최대 5,000장까지 전달할 수 있습니다.");
  }
  const output = value.map((entry) => {
    if (typeof entry !== "string") throw new Error("선택 사진 경로가 올바르지 않습니다.");
    const normalized = entry.trim().replace(/\\/gu, "/").normalize("NFC");
    const parts = normalized.split("/");
    if (!normalized || normalized.includes("\0") || normalized.startsWith("/") || parts.some((part) => !part || part === "." || part === "..")) {
      throw new Error("선택 사진 경로가 올바르지 않습니다.");
    }
    return normalized;
  });
  return [...new Set(output)];
}

function normalizeMatch(requested: RemoteJobPayload): RemoteJobPayload {
  const sourcePath = safePersonSelectSourcePath(requested.source_path ?? requested.source_relative_path);
  const outputPath = optionalSafePath(requested.output_path ?? requested.output_relative_path);
  const options = requested.options && typeof requested.options === "object" && !Array.isArray(requested.options)
    ? requested.options as RemoteJobPayload
    : {};
  const reference = requested.reference && typeof requested.reference === "object" && !Array.isArray(requested.reference)
    ? requested.reference as RemoteJobPayload
    : {};
  const brightness = options.brightness ?? requested.brightness ?? true;
  const skinTone = options.skin_tone ?? options.skinTone ?? requested.skin_tone ?? requested.skinTone ?? true;
  if (typeof brightness !== "boolean" || typeof skinTone !== "boolean") {
    throw new Error("색 맞춤 옵션이 올바르지 않습니다.");
  }
  if (!brightness && !skinTone) throw new Error("밝기 또는 얼굴·바디 톤 중 하나를 선택해 주세요.");
  const targetMode = reference.mode ?? requested.target_mode ?? requested.targetMode ?? "median";
  if (targetMode !== "median" && targetMode !== "reference") throw new Error("색 맞춤 기준이 올바르지 않습니다.");
  const referenceFile = reference.file ?? requested.reference_file ?? requested.referenceFile;
  if (referenceFile !== undefined && (typeof referenceFile !== "string" || referenceFile.length > 1_000)) {
    throw new Error("기준 사진 파일명이 올바르지 않습니다.");
  }
  if (targetMode === "reference" && !String(referenceFile ?? "").trim()) {
    throw new Error("기준 사진을 선택해 주세요.");
  }
  return {
    source_path: sourcePath,
    ...(outputPath ? { output_path: outputPath } : {}),
    options: { brightness, skin_tone: skinTone },
    reference: { mode: targetMode, ...(referenceFile ? { file: String(referenceFile).trim() } : {}) },
    ...(requested.selected_file_names !== undefined
      ? { selected_file_names: safeRelativeSelection(requested.selected_file_names) }
      : {}),
  };
}

function normalizeRender(requested: RemoteJobPayload): RemoteJobPayload {
  const outputPath = safePersonSelectSourcePath(requested.output_path ?? requested.output_relative_path);
  const changes = requested.changes;
  if (!Array.isArray(changes) || changes.length > 500 || changes.some((entry) => !entry || typeof entry !== "object" || Array.isArray(entry))) {
    throw new Error("색 맞춤 저장 항목은 최대 500장이어야 합니다.");
  }
  const normalizedChanges = changes.map((entry) => {
    const item = entry as RemoteJobPayload;
    const relativePath = safeRelativeSelection([item.relativePath])?.[0];
    if (!relativePath) throw new Error("색 맞춤 파일 경로가 올바르지 않습니다.");
    return { relativePath, recipe: parsePhotoEditRecipe(item.recipe) };
  });
  const commonRecipe = requested.common_recipe === undefined ? undefined : parsePhotoEditRecipe(requested.common_recipe);
  const targetMeasurement = requested.target_measurement === undefined ? undefined : parsePhotoMeasurement(requested.target_measurement);
  if (!normalizedChanges.length && !commonRecipe) throw new Error("저장할 색 맞춤 변경값이 없습니다.");
  return {
    output_path: outputPath,
    changes: normalizedChanges,
    ...(commonRecipe ? { common_recipe: commonRecipe } : {}),
    ...(targetMeasurement ? { target_measurement: targetMeasurement } : {}),
  };
}

export function normalizePhotoColorRequestPayload(
  action: RemoteJobAction,
  requested: RemoteJobPayload,
): RemoteJobPayload | null {
  if (action === "PHOTO_COLOR_MATCH") return normalizeMatch(requested);
  if (action === "PHOTO_COLOR_RENDER") return normalizeRender(requested);
  return null;
}
