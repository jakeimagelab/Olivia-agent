import type { OliviaUiSurface } from "@/lib/olivia/surfaceContext";

export type ExecutionMode = "LOCAL_DIRECT" | "REMOTE_WORKER";

export const PHOTO_STUDIO_EXECUTION_MODE_STORAGE_KEY = "olivia:photo-studio:execution-mode";
export const LEGACY_PHOTO_EXECUTION_MODE_STORAGE_KEY = "olivia:photo-classifier:execution-mode";
/** @deprecated Use PHOTO_STUDIO_EXECUTION_MODE_STORAGE_KEY. */
export const PHOTO_EXECUTION_MODE_STORAGE_KEY = PHOTO_STUDIO_EXECUTION_MODE_STORAGE_KEY;
export const PHOTO_STUDIO_REMOTE_JOB_STORAGE_KEY = "olivia:photo-studio:remote-job-id";

export function photoSourceModesForSurface(
  surface: OliviaUiSurface,
): readonly ExecutionMode[] {
  return surface === "desktop"
    ? ["LOCAL_DIRECT", "REMOTE_WORKER"]
    : ["REMOTE_WORKER"];
}

export function canUseLocalPhotoSource(surface: OliviaUiSurface): boolean {
  return photoSourceModesForSurface(surface).includes("LOCAL_DIRECT");
}

export function resolvePhotoExecutionMode(
  surface: OliviaUiSurface,
  storedMode?: string | null,
): ExecutionMode {
  if (!canUseLocalPhotoSource(surface)) return "REMOTE_WORKER";
  return storedMode === "REMOTE_WORKER" ? "REMOTE_WORKER" : "LOCAL_DIRECT";
}

export function readPhotoStudioExecutionMode(
  storage: Pick<Storage, "getItem" | "setItem" | "removeItem">,
): string | null {
  const current = storage.getItem(PHOTO_STUDIO_EXECUTION_MODE_STORAGE_KEY);
  if (current) return current;

  const legacy = storage.getItem(LEGACY_PHOTO_EXECUTION_MODE_STORAGE_KEY);
  if (!legacy) return null;

  storage.setItem(PHOTO_STUDIO_EXECUTION_MODE_STORAGE_KEY, legacy);
  storage.removeItem(LEGACY_PHOTO_EXECUTION_MODE_STORAGE_KEY);
  return legacy;
}
