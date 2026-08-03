import type { LocalVisualFeatures } from "./hybrid-types";

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

function normalize(values: number[]): number[] {
  const total = values.reduce((sum, value) => sum + value, 0);
  return total > 0 ? values.map((value) => value / total) : values;
}

function grayscale(red: number, green: number, blue: number) {
  return red * 0.299 + green * 0.587 + blue * 0.114;
}

function samplePixel(data: Uint8ClampedArray, width: number, height: number, xRatio: number, yRatio: number) {
  const x = Math.min(width - 1, Math.max(0, Math.round(xRatio * (width - 1))));
  const y = Math.min(height - 1, Math.max(0, Math.round(yRatio * (height - 1))));
  const offset = (y * width + x) * 4;
  return [data[offset], data[offset + 1], data[offset + 2]] as const;
}

export function extractVisualFeaturesFromImageData(imageData: ImageData): LocalVisualFeatures {
  const { data, width, height } = imageData;
  const histogram = new Array<number>(64).fill(0);
  let brightnessTotal = 0;
  let sampled = 0;
  const stride = Math.max(1, Math.floor(Math.sqrt((width * height) / 16000)));
  for (let y = 0; y < height; y += stride) {
    for (let x = 0; x < width; x += stride) {
      const offset = (y * width + x) * 4;
      const red = data[offset];
      const green = data[offset + 1];
      const blue = data[offset + 2];
      histogram[(red >> 6) * 16 + (green >> 6) * 4 + (blue >> 6)] += 1;
      brightnessTotal += grayscale(red, green, blue) / 255;
      sampled += 1;
    }
  }

  let dHash = "";
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      const left = samplePixel(data, width, height, x / 8, (y + 0.5) / 8);
      const right = samplePixel(data, width, height, (x + 1) / 8, (y + 0.5) / 8);
      dHash += grayscale(...left) > grayscale(...right) ? "1" : "0";
    }
  }

  const backgroundGrid: number[] = [];
  for (let y = 0; y < 3; y++) {
    for (let x = 0; x < 3; x++) {
      if (x === 1 && y === 1) continue;
      const pixel = samplePixel(data, width, height, (x + 0.5) / 3, (y + 0.5) / 3);
      backgroundGrid.push(pixel[0] / 255, pixel[1] / 255, pixel[2] / 255);
    }
  }

  const compositionGrid: number[] = [];
  for (let y = 0; y < 4; y++) {
    for (let x = 0; x < 4; x++) {
      const pixel = samplePixel(data, width, height, (x + 0.5) / 4, (y + 0.5) / 4);
      compositionGrid.push(grayscale(...pixel) / 255);
    }
  }

  return {
    dHash,
    colorHistogram: normalize(histogram),
    backgroundGrid,
    compositionGrid,
    brightness: sampled > 0 ? brightnessTotal / sampled : 0,
  };
}

function vectorDistance(left: number[], right: number[]) {
  const length = Math.min(left.length, right.length);
  if (length === 0) return 0;
  let total = 0;
  for (let index = 0; index < length; index++) total += Math.abs(left[index] - right[index]);
  return clamp01(total / length);
}

function histogramDistance(left: number[], right: number[]) {
  const length = Math.min(left.length, right.length);
  let intersection = 0;
  for (let index = 0; index < length; index++) intersection += Math.min(left[index], right[index]);
  return clamp01(1 - intersection);
}

function hashDistance(left: string, right: string) {
  const length = Math.min(left.length, right.length);
  if (length === 0) return 0;
  let changed = 0;
  for (let index = 0; index < length; index++) if (left[index] !== right[index]) changed += 1;
  return changed / length;
}

export function visualChangeScore(left: LocalVisualFeatures, right: LocalVisualFeatures) {
  return clamp01(
    hashDistance(left.dHash, right.dHash) * 0.35
    + histogramDistance(left.colorHistogram, right.colorHistogram) * 0.25
    + vectorDistance(left.backgroundGrid, right.backgroundGrid) * 0.20
    + vectorDistance(left.compositionGrid, right.compositionGrid) * 0.15
    + Math.abs(left.brightness - right.brightness) * 0.05,
  );
}

function median(values: number[]) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
}

export function medianVisualFeatures(features: LocalVisualFeatures[]): LocalVisualFeatures {
  if (features.length === 0) return { dHash: "", colorHistogram: [], backgroundGrid: [], compositionGrid: [], brightness: 0 };
  const vectorMedian = (selector: (feature: LocalVisualFeatures) => number[]) => {
    const length = selector(features[0]).length;
    return Array.from({ length }, (_, index) => median(features.map((feature) => selector(feature)[index] ?? 0)));
  };
  const hashLength = features[0].dHash.length;
  const dHash = Array.from({ length: hashLength }, (_, index) =>
    median(features.map((feature) => feature.dHash[index] === "1" ? 1 : 0)) >= 0.5 ? "1" : "0",
  ).join("");
  return {
    dHash,
    colorHistogram: normalize(vectorMedian((feature) => feature.colorHistogram)),
    backgroundGrid: vectorMedian((feature) => feature.backgroundGrid),
    compositionGrid: vectorMedian((feature) => feature.compositionGrid),
    brightness: median(features.map((feature) => feature.brightness)),
  };
}
