import { describe, expect, it } from "vitest";
import {
  LEGACY_PHOTO_EXECUTION_MODE_STORAGE_KEY,
  PHOTO_STUDIO_EXECUTION_MODE_STORAGE_KEY,
  canUseLocalPhotoSource,
  photoSourceModesForSurface,
  readPhotoStudioExecutionMode,
  resolvePhotoExecutionMode,
} from "@/lib/photo-classifier/photoSource";

describe("photo source surface policy", () => {
  it("offers local and remote sources on desktop", () => {
    expect(photoSourceModesForSurface("desktop")).toEqual([
      "LOCAL_DIRECT",
      "REMOTE_WORKER",
    ]);
    expect(canUseLocalPhotoSource("desktop")).toBe(true);
  });

  it.each(["tablet", "mobile"] as const)(
    "offers remote only on %s",
    (surface) => {
      expect(photoSourceModesForSurface(surface)).toEqual(["REMOTE_WORKER"]);
      expect(canUseLocalPhotoSource(surface)).toBe(false);
      expect(resolvePhotoExecutionMode(surface, "LOCAL_DIRECT")).toBe("REMOTE_WORKER");
    },
  );

  it("restores the last explicit desktop mode and otherwise defaults to local", () => {
    expect(resolvePhotoExecutionMode("desktop", "REMOTE_WORKER")).toBe("REMOTE_WORKER");
    expect(resolvePhotoExecutionMode("desktop", "LOCAL_DIRECT")).toBe("LOCAL_DIRECT");
    expect(resolvePhotoExecutionMode("desktop", null)).toBe("LOCAL_DIRECT");
  });

  it("migrates the previous classifier-only storage key", () => {
    const values = new Map([[LEGACY_PHOTO_EXECUTION_MODE_STORAGE_KEY, "REMOTE_WORKER"]]);
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
    };

    expect(readPhotoStudioExecutionMode(storage)).toBe("REMOTE_WORKER");
    expect(values.get(PHOTO_STUDIO_EXECUTION_MODE_STORAGE_KEY)).toBe("REMOTE_WORKER");
    expect(values.has(LEGACY_PHOTO_EXECUTION_MODE_STORAGE_KEY)).toBe(false);
  });
});
