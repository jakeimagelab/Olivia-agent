import type { OliviaUiSurface } from "@/lib/olivia/surfaceContext";

export type ExecutionMode = "LOCAL_DIRECT" | "REMOTE_WORKER";

export const PHOTO_EXECUTION_MODE_STORAGE_KEY = "olivia:photo-classifier:execution-mode";

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
