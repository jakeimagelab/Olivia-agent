import { clonePhotoEditRecipe, type LabColor, type PhotoEditRecipe, type PhotoMeasurement } from "./types";

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("색 맞춤 레시피가 올바르지 않습니다.");
  return value as Record<string, unknown>;
}

function finite(source: Record<string, unknown>, key: string, min: number, max: number): number {
  const value = source[key];
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) {
    throw new Error(`색 맞춤 ${key} 값이 올바르지 않습니다.`);
  }
  return value;
}

export function parsePhotoEditRecipe(value: unknown): PhotoEditRecipe {
  const source = record(value);
  if (source.recipeVersion !== 1) throw new Error("지원하지 않는 색 맞춤 레시피 버전입니다.");
  const light = record(source.light);
  const color = record(source.color);
  const skin = record(source.skin);
  const gown = record(source.gown);
  const curve = record(source.curve);
  const points = curve.points;
  if (!Array.isArray(points) || points.length < 2 || points.length > 32) throw new Error("곡선 점은 2~32개여야 합니다.");
  const parsed: PhotoEditRecipe = {
    recipeVersion: 1,
    light: {
      exposure: finite(light, "exposure", -2, 2),
      contrast: finite(light, "contrast", -100, 100),
      highlights: finite(light, "highlights", -100, 100),
      shadows: finite(light, "shadows", -100, 100),
      whites: finite(light, "whites", -100, 100),
      blacks: finite(light, "blacks", -100, 100),
    },
    color: {
      temperature: finite(color, "temperature", -100, 100),
      tint: finite(color, "tint", -100, 100),
    },
    skin: {
      hue: finite(skin, "hue", -100, 100),
      chroma: finite(skin, "chroma", -100, 100),
      lightness: finite(skin, "lightness", -100, 100),
      highlight: finite(skin, "highlight", -100, 100),
      mid: finite(skin, "mid", -100, 100),
      shadow: finite(skin, "shadow", -100, 100),
      uniformity: finite(skin, "uniformity", 0, 100),
    },
    gown: {
      lightness: finite(gown, "lightness", -100, 100),
      warmth: finite(gown, "warmth", -100, 100),
      tint: finite(gown, "tint", -100, 100),
      strength: finite(gown, "strength", 0, 100),
    },
    curve: {
      points: points.map((point) => {
        if (!Array.isArray(point) || point.length !== 2 || point.some((entry) => typeof entry !== "number" || !Number.isFinite(entry) || entry < 0 || entry > 100)) {
          throw new Error("곡선 점의 x, y는 0~100이어야 합니다.");
        }
        return [point[0] as number, point[1] as number] as [number, number];
      }),
    },
  };
  return clonePhotoEditRecipe(parsed);
}

function parseLab(value: unknown): LabColor | null {
  if (value === null || value === undefined) return null;
  const source = record(value);
  return {
    l: finite(source, "l", -200, 200),
    a: finite(source, "a", -200, 200),
    b: finite(source, "b", -200, 200),
  };
}

export function parsePhotoMeasurement(value: unknown): PhotoMeasurement {
  const source = record(value);
  const skinSource = source.skin === null || source.skin === undefined ? null : record(source.skin);
  return {
    skin: skinSource ? {
      pixelRatio: finite(skinSource, "pixelRatio", 0, 1),
      count: finite(skinSource, "count", 0, 100_000_000),
      l25: finite(skinSource, "l25", -100, 200),
      l50: finite(skinSource, "l50", -100, 200),
      l75: finite(skinSource, "l75", -100, 200),
      chroma: finite(skinSource, "chroma", 0, 300),
      hue: finite(skinSource, "hue", 0, 360),
      lab: parseLab(skinSource.lab)!,
    } : null,
    background: parseLab(source.background),
    gown: parseLab(source.gown),
  };
}
