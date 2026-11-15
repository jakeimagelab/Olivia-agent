export type LabColor = { l: number; a: number; b: number };

export type PhotoEditRecipe = {
  recipeVersion: 1;
  light: {
    exposure: number;
    contrast: number;
    highlights: number;
    shadows: number;
    whites: number;
    blacks: number;
  };
  color: { temperature: number; tint: number };
  skin: {
    hue: number;
    chroma: number;
    lightness: number;
    highlight: number;
    mid: number;
    shadow: number;
    uniformity: number;
  };
  gown: { lightness: number; warmth: number; tint: number; strength: number };
  curve: { points: Array<[number, number]> };
};

export type PhotoEditImage = {
  data: Uint8Array;
  width: number;
  height: number;
};

export type PhotoEditMasks = {
  skin: Float32Array;
  gown: Float32Array;
};

export type SkinMeasurement = {
  pixelRatio: number;
  count: number;
  l25: number;
  l50: number;
  l75: number;
  chroma: number;
  hue: number;
  lab: LabColor;
};

export type PhotoMeasurement = {
  skin: SkinMeasurement | null;
  background: LabColor | null;
  gown: LabColor | null;
};

export type AutoMatchOptions = {
  brightness: boolean;
  skinTone: boolean;
  uniformity?: number;
};

export type PhotoEditResult = PhotoEditImage & {
  masks: PhotoEditMasks;
  measurementBefore: PhotoMeasurement;
  measurementAfter: PhotoMeasurement;
};

export const IDENTITY_PHOTO_EDIT_RECIPE: PhotoEditRecipe = {
  recipeVersion: 1,
  light: { exposure: 0, contrast: 0, highlights: 0, shadows: 0, whites: 0, blacks: 0 },
  color: { temperature: 0, tint: 0 },
  skin: { hue: 0, chroma: 0, lightness: 0, highlight: 0, mid: 0, shadow: 0, uniformity: 0 },
  gown: { lightness: 0, warmth: 0, tint: 0, strength: 0 },
  curve: { points: [[0, 0], [100, 100]] },
};

export function clonePhotoEditRecipe(recipe: PhotoEditRecipe = IDENTITY_PHOTO_EDIT_RECIPE): PhotoEditRecipe {
  return {
    recipeVersion: 1,
    light: { ...recipe.light },
    color: { ...recipe.color },
    skin: { ...recipe.skin },
    gown: { ...recipe.gown },
    curve: { points: recipe.curve.points.map(([x, y]) => [x, y]) },
  };
}
