import type { PhotoEditRecipe, PhotoMeasurement } from "./types";

export type ColorMatchTargetMode = "median" | "reference";

export type ColorMatchFileManifest = {
  relativePath: string;
  fileName: string;
  recipe: PhotoEditRecipe;
  measurementBefore: PhotoMeasurement;
  measurementAfter: PhotoMeasurement;
  deltaBefore: number | null;
  deltaAfter: number | null;
  signalBefore: "pass" | "check" | "review" | "no-skin";
  signalAfter: "pass" | "check" | "review" | "no-skin";
  sourcePreviewPath: string;
  resultPreviewPath: string;
  convertedToSrgb: boolean;
  exif: {
    iso: number | null;
    lens: string | null;
    aperture: number | null;
    shutter: string | null;
    capturedAt: string | null;
  };
};

export type ColorMatchManifest = {
  manifestVersion: 1;
  runId: string;
  manifestStoragePath: string;
  eventId: string;
  createdAt: string;
  updatedAt: string;
  sourcePath: string;
  sourceVirtualPath: string;
  outputPath: string;
  outputVirtualPath: string;
  targetMode: ColorMatchTargetMode;
  referenceFile: string | null;
  targetMeasurement: PhotoMeasurement;
  commonRecipe: PhotoEditRecipe;
  options: { brightness: boolean; skinTone: boolean };
  files: ColorMatchFileManifest[];
};

export type ColorMatchPublicFile = ColorMatchFileManifest & {
  sourcePreviewUrl: string | null;
  resultPreviewUrl: string | null;
};

export type ColorMatchPublicResult = Omit<ColorMatchManifest, "files"> & {
  files: ColorMatchPublicFile[];
  summary: { total: number; pass: number; check: number; review: number; noSkin: number };
};
