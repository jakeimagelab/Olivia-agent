import {
  clamp,
  deltaE76,
  labChroma,
  labHue,
  labToLinearRgb,
  lchToLab,
  linearChannelToSrgb,
  linearRgbToLab,
  shortestHueDelta,
  smoothstep,
  srgbChannelToLinear,
} from "./colorSpace";
import { createPhotoEditMasks } from "./masks";
import { measurePhoto } from "./measurement";
import {
  clonePhotoEditRecipe,
  IDENTITY_PHOTO_EDIT_RECIPE,
  type AutoMatchOptions,
  type PhotoEditImage,
  type PhotoEditMasks,
  type PhotoEditRecipe,
  type PhotoEditResult,
  type PhotoMeasurement,
} from "./types";

const BAYER_4 = [
  -0.5, 0, -0.375, 0.125,
  0.25, -0.25, 0.375, -0.125,
  -0.3125, 0.1875, -0.4375, 0.0625,
  0.4375, -0.0625, 0.3125, -0.1875,
] as const;

function clampAdjustment(value: number, min = -100, max = 100): number {
  return clamp(Number.isFinite(value) ? value : 0, min, max);
}

function normalizeRecipe(recipe: PhotoEditRecipe): PhotoEditRecipe {
  const next = clonePhotoEditRecipe(recipe);
  next.light.exposure = clampAdjustment(next.light.exposure, -2, 2);
  for (const key of ["contrast", "highlights", "shadows", "whites", "blacks"] as const) next.light[key] = clampAdjustment(next.light[key]);
  next.color.temperature = clampAdjustment(next.color.temperature);
  next.color.tint = clampAdjustment(next.color.tint);
  for (const key of ["hue", "chroma", "lightness", "highlight", "mid", "shadow", "uniformity"] as const) next.skin[key] = clampAdjustment(next.skin[key]);
  for (const key of ["lightness", "warmth", "tint"] as const) next.gown[key] = clampAdjustment(next.gown[key]);
  next.gown.strength = clampAdjustment(next.gown.strength, 0, 100);
  next.curve.points = normalizeCurvePoints(next.curve.points);
  return next;
}

function normalizeCurvePoints(points: Array<[number, number]>): Array<[number, number]> {
  const sorted = points
    .filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y))
    .map(([x, y]): [number, number] => [clamp(x, 0, 100), clamp(y, 0, 100)])
    .sort((left, right) => left[0] - right[0]);
  const unique: Array<[number, number]> = [];
  for (const point of sorted) {
    const previous = unique.at(-1);
    if (previous && Math.abs(previous[0] - point[0]) < 1e-6) previous[1] = Math.max(previous[1], point[1]);
    else unique.push(point);
  }
  if (!unique.length || unique[0][0] > 0) unique.unshift([0, 0]);
  if (unique.at(-1)![0] < 100) unique.push([100, 100]);
  let previousY = 0;
  return unique.map(([x, y]) => {
    const monotonicY = Math.max(previousY, y);
    previousY = monotonicY;
    return [x, monotonicY];
  });
}

/** Fritsch-Carlson monotone cubic interpolation. */
export function evaluateMonotoneCurve(points: Array<[number, number]>, input: number): number {
  const normalized = normalizeCurvePoints(points);
  const x = clamp(input, 0, 100);
  let segment = normalized.length - 2;
  for (let index = 0; index < normalized.length - 1; index += 1) {
    if (x <= normalized[index + 1][0]) { segment = index; break; }
  }
  const slopes = normalized.slice(0, -1).map(([x0, y0], index) => {
    const [x1, y1] = normalized[index + 1];
    return (y1 - y0) / Math.max(1e-6, x1 - x0);
  });
  const tangents = normalized.map((_, index) => {
    if (index === 0) return slopes[0];
    if (index === normalized.length - 1) return slopes.at(-1)!;
    if (slopes[index - 1] * slopes[index] <= 0) return 0;
    return 2 / (1 / slopes[index - 1] + 1 / slopes[index]);
  });
  const [x0, y0] = normalized[segment];
  const [x1, y1] = normalized[segment + 1];
  const distance = Math.max(1e-6, x1 - x0);
  const t = (x - x0) / distance;
  const t2 = t * t;
  const t3 = t2 * t;
  return clamp(
    (2 * t3 - 3 * t2 + 1) * y0
      + (t3 - 2 * t2 + t) * distance * tangents[segment]
      + (-2 * t3 + 3 * t2) * y1
      + (t3 - t2) * distance * tangents[segment + 1],
    0,
    100,
  );
}

function lightTone(l: number, recipe: PhotoEditRecipe["light"]): number {
  const normalized = clamp(l / 100, 0, 1);
  const contrast = recipe.contrast / 100;
  const sCurve = normalized * normalized * (3 - 2 * normalized);
  // Zero must be a true identity. Positive contrast blends toward an endpoint-
  // preserving S curve; negative contrast compresses gently toward middle gray.
  let next = contrast >= 0
    ? normalized + (sCurve - normalized) * contrast
    : normalized + (0.5 - normalized) * -contrast * 0.65;
  next += recipe.highlights / 100 * 0.22 * smoothstep(48, 100, l);
  next += recipe.shadows / 100 * 0.22 * (1 - smoothstep(0, 52, l));
  next += recipe.whites / 100 * 0.12 * smoothstep(78, 100, l);
  next += recipe.blacks / 100 * 0.12 * (1 - smoothstep(0, 22, l));
  return clamp(next * 100, 0, 100);
}

function skinLightness(l: number, measurement: NonNullable<PhotoMeasurement["skin"]>, skin: PhotoEditRecipe["skin"]): number {
  const points: Array<[number, number]> = [
    [0, 0],
    [measurement.l25, measurement.l25 + skin.lightness + skin.shadow],
    [measurement.l50, measurement.l50 + skin.lightness + skin.mid],
    [measurement.l75, measurement.l75 + skin.lightness + skin.highlight],
    [100, 100],
  ];
  return evaluateMonotoneCurve(points, l);
}

function temperatureMultipliers(temperature: number, tint: number): [number, number, number] {
  const warmth = temperature / 100;
  const magenta = tint / 100;
  return [
    Math.exp(warmth * 0.12 + magenta * 0.035),
    Math.exp(-magenta * 0.08),
    Math.exp(-warmth * 0.12 + magenta * 0.035),
  ];
}

export function mergePhotoEditRecipes(common: PhotoEditRecipe, photo: PhotoEditRecipe): PhotoEditRecipe {
  const next = clonePhotoEditRecipe(common);
  const add = <T extends Record<string, number>>(target: T, source: T) => {
    for (const key of Object.keys(target) as Array<keyof T>) target[key] = (target[key] + source[key]) as T[keyof T];
  };
  add(next.light, photo.light);
  add(next.color, photo.color);
  add(next.skin, photo.skin);
  add(next.gown, photo.gown);
  const photoCurveIsIdentity = photo.curve.points.length === 2
    && photo.curve.points[0][0] === 0 && photo.curve.points[0][1] === 0
    && photo.curve.points[1][0] === 100 && photo.curve.points[1][1] === 100;
  if (!photoCurveIsIdentity) next.curve.points = photo.curve.points.map(([x, y]) => [x, y]);
  return normalizeRecipe(next);
}

export function deriveAutomaticRecipe(
  measurement: PhotoMeasurement,
  target: PhotoMeasurement,
  options: AutoMatchOptions,
): PhotoEditRecipe {
  const recipe = clonePhotoEditRecipe(IDENTITY_PHOTO_EDIT_RECIPE);
  if (!measurement.skin || !target.skin) return recipe;
  if (options.brightness) {
    recipe.skin.lightness = clampAdjustment(target.skin.l50 - measurement.skin.l50);
    recipe.skin.shadow = clampAdjustment((target.skin.l25 - measurement.skin.l25) - recipe.skin.lightness);
    recipe.skin.highlight = clampAdjustment((target.skin.l75 - measurement.skin.l75) - recipe.skin.lightness);
  }
  if (options.skinTone) {
    recipe.skin.hue = clampAdjustment(shortestHueDelta(measurement.skin.hue, target.skin.hue));
    recipe.skin.chroma = clampAdjustment((target.skin.chroma / Math.max(0.1, measurement.skin.chroma) - 1) * 100);
    recipe.skin.uniformity = clampAdjustment(options.uniformity ?? 10, 0, 100);
  }
  return recipe;
}

export function applyPhotoEditRecipe(
  image: PhotoEditImage,
  inputRecipe: PhotoEditRecipe,
  frozenMasks?: PhotoEditMasks,
): PhotoEditResult {
  if (image.data.length !== image.width * image.height * 3) throw new Error("RGB 버퍼 크기와 이미지 크기가 맞지 않습니다.");
  const recipe = normalizeRecipe(inputRecipe);
  const masks = frozenMasks ?? createPhotoEditMasks(image);
  const measurementBefore = measurePhoto(image, masks);
  const output = new Uint8Array(image.data.length);
  const exposure = 2 ** recipe.light.exposure;
  const [redScale, greenScale, blueScale] = temperatureMultipliers(recipe.color.temperature, recipe.color.tint);
  for (let index = 0; index < image.width * image.height; index += 1) {
    const offset = index * 3;
    let red = srgbChannelToLinear(image.data[offset] / 255) * exposure;
    let green = srgbChannelToLinear(image.data[offset + 1] / 255) * exposure;
    let blue = srgbChannelToLinear(image.data[offset + 2] / 255) * exposure;
    let lab = linearRgbToLab(red, green, blue);
    lab.l = lightTone(lab.l, recipe.light);
    [red, green, blue] = labToLinearRgb(lab);
    red *= redScale; green *= greenScale; blue *= blueScale;
    lab = linearRgbToLab(clamp(red, 0, 1), clamp(green, 0, 1), clamp(blue, 0, 1));

    const skinWeight = masks.skin[index];
    if (skinWeight > 0 && measurementBefore.skin) {
      const currentChroma = labChroma(lab);
      const currentHue = labHue(lab);
      const uniformity = recipe.skin.uniformity / 100 * skinWeight;
      const uniformHue = currentHue + shortestHueDelta(currentHue, measurementBefore.skin.hue) * uniformity;
      const uniformChroma = currentChroma + (measurementBefore.skin.chroma - currentChroma) * uniformity;
      const targetHue = uniformHue + recipe.skin.hue;
      const targetChroma = Math.max(0, uniformChroma * (1 + recipe.skin.chroma / 100));
      const targetLightness = skinLightness(lab.l, measurementBefore.skin, recipe.skin);
      const adjusted = lchToLab(targetLightness, targetChroma, targetHue);
      lab = {
        l: lab.l + (adjusted.l - lab.l) * skinWeight,
        a: lab.a + (adjusted.a - lab.a) * skinWeight,
        b: lab.b + (adjusted.b - lab.b) * skinWeight,
      };
    }

    const gownWeight = masks.gown[index] * recipe.gown.strength / 100;
    if (gownWeight > 0) {
      lab = {
        l: lab.l + recipe.gown.lightness * 0.2 * gownWeight,
        a: lab.a + recipe.gown.tint * 0.08 * gownWeight,
        b: lab.b + recipe.gown.warmth * 0.08 * gownWeight,
      };
    }
    lab.l = evaluateMonotoneCurve(recipe.curve.points, lab.l);
    [red, green, blue] = labToLinearRgb(lab);
    const x = index % image.width;
    const y = Math.floor(index / image.width);
    const dither = BAYER_4[(y % 4) * 4 + (x % 4)];
    output[offset] = clamp(Math.round(linearChannelToSrgb(red) * 255 + dither), 0, 255);
    output[offset + 1] = clamp(Math.round(linearChannelToSrgb(green) * 255 - dither * 0.5), 0, 255);
    output[offset + 2] = clamp(Math.round(linearChannelToSrgb(blue) * 255 + dither * 0.25), 0, 255);
  }
  const resultImage = { data: output, width: image.width, height: image.height };
  return { ...resultImage, masks, measurementBefore, measurementAfter: measurePhoto(resultImage, masks) };
}

export function skinDifference(measurement: PhotoMeasurement, target: PhotoMeasurement): number | null {
  return measurement.skin && target.skin ? deltaE76(measurement.skin.lab, target.skin.lab) : null;
}

export function colorMatchSignal(deltaE: number | null): "pass" | "check" | "review" | "no-skin" {
  if (deltaE === null) return "no-skin";
  if (deltaE <= 2) return "pass";
  if (deltaE <= 4) return "check";
  return "review";
}
