import { labChroma, labHue, lchToLab, srgbToLab } from "./colorSpace";
import { estimateBackgroundLab } from "./masks";
import type { LabColor, PhotoEditImage, PhotoEditMasks, PhotoMeasurement, SkinMeasurement } from "./types";

function percentile(values: number[], ratio: number): number {
  if (!values.length) return 0;
  const position = (values.length - 1) * ratio;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  return values[lower] + (values[upper] - values[lower]) * (position - lower);
}

function median(values: number[]): number {
  return percentile(values, 0.5);
}

function medianLab(values: LabColor[]): LabColor | null {
  if (!values.length) return null;
  const l = values.map((entry) => entry.l).sort((a, b) => a - b);
  const a = values.map((entry) => entry.a).sort((x, y) => x - y);
  const b = values.map((entry) => entry.b).sort((x, y) => x - y);
  return { l: median(l), a: median(a), b: median(b) };
}

export function measurePhoto(image: PhotoEditImage, masks: PhotoEditMasks): PhotoMeasurement {
  const totalPixels = image.width * image.height;
  const step = Math.max(1, Math.ceil(totalPixels / 400_000));
  const skinL: number[] = [];
  const skinC: number[] = [];
  const skinH: number[] = [];
  const gownLabs: LabColor[] = [];
  let sampled = 0;
  for (let index = 0; index < totalPixels; index += step) {
    sampled += 1;
    const offset = index * 3;
    const lab = srgbToLab(image.data[offset], image.data[offset + 1], image.data[offset + 2]);
    if (masks.skin[index] >= 0.6) {
      skinL.push(lab.l);
      skinC.push(labChroma(lab));
      skinH.push(labHue(lab));
    }
    if (masks.gown[index] >= 0.6) gownLabs.push(lab);
  }
  skinL.sort((a, b) => a - b);
  skinC.sort((a, b) => a - b);
  skinH.sort((a, b) => a - b);
  const skinRatio = skinL.length / Math.max(1, sampled);
  let skin: SkinMeasurement | null = null;
  if (skinRatio >= 0.003) {
    const l50 = percentile(skinL, 0.5);
    const chroma = median(skinC);
    const hue = median(skinH);
    skin = {
      pixelRatio: skinRatio,
      count: skinL.length,
      l25: percentile(skinL, 0.25),
      l50,
      l75: percentile(skinL, 0.75),
      chroma,
      hue,
      lab: lchToLab(l50, chroma, hue),
    };
  }
  return {
    skin,
    background: estimateBackgroundLab(image),
    gown: medianLab(gownLabs),
  };
}

function nullableMedian(values: number[]): number | null {
  if (!values.length) return null;
  values.sort((a, b) => a - b);
  return median(values);
}

export function medianPhotoMeasurement(measurements: readonly PhotoMeasurement[]): PhotoMeasurement {
  const skins = measurements.flatMap((entry) => entry.skin ? [entry.skin] : []);
  const backgrounds = measurements.flatMap((entry) => entry.background ? [entry.background] : []);
  const gowns = measurements.flatMap((entry) => entry.gown ? [entry.gown] : []);
  const medianColor = (values: LabColor[]) => {
    if (!values.length) return null;
    return {
      l: nullableMedian(values.map((entry) => entry.l)) ?? 0,
      a: nullableMedian(values.map((entry) => entry.a)) ?? 0,
      b: nullableMedian(values.map((entry) => entry.b)) ?? 0,
    };
  };
  const skin = skins.length ? {
    pixelRatio: nullableMedian(skins.map((entry) => entry.pixelRatio)) ?? 0,
    count: Math.round(nullableMedian(skins.map((entry) => entry.count)) ?? 0),
    l25: nullableMedian(skins.map((entry) => entry.l25)) ?? 0,
    l50: nullableMedian(skins.map((entry) => entry.l50)) ?? 0,
    l75: nullableMedian(skins.map((entry) => entry.l75)) ?? 0,
    chroma: nullableMedian(skins.map((entry) => entry.chroma)) ?? 0,
    hue: nullableMedian(skins.map((entry) => entry.hue)) ?? 0,
    lab: medianColor(skins.map((entry) => entry.lab)) ?? { l: 0, a: 0, b: 0 },
  } satisfies SkinMeasurement : null;
  return { skin, background: medianColor(backgrounds), gown: medianColor(gowns) };
}
