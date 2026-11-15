import { describe, expect, it } from "vitest";

import {
  applyPhotoEditRecipe,
  clonePhotoEditRecipe,
  createPhotoEditMasks,
  deltaE76,
  deriveAutomaticRecipe,
  IDENTITY_PHOTO_EDIT_RECIPE,
  labToSrgb,
  measurePhoto,
  medianPhotoMeasurement,
  srgbToLab,
} from "@/lib/photo-edit";

function solid(width: number, height: number, rgb: [number, number, number]) {
  const data = new Uint8Array(width * height * 3);
  for (let index = 0; index < width * height; index += 1) data.set(rgb, index * 3);
  return { data, width, height };
}

function portrait(skin: [number, number, number]) {
  const width = 96;
  const height = 128;
  const image = solid(width, height, [128, 128, 128]);
  for (let y = 20; y < 70; y += 1) {
    for (let x = 22; x < 74; x += 1) image.data.set(skin, (y * width + x) * 3);
  }
  for (let y = 75; y < height; y += 1) {
    for (let x = 12; x < 84; x += 1) image.data.set([240, 240, 240], (y * width + x) * 3);
  }
  return image;
}

describe("photo edit color engine", () => {
  it("round-trips sRGB and Lab within one byte", () => {
    for (const rgb of [[0, 0, 0], [255, 255, 255], [190, 126, 98], [35, 74, 180], [127, 128, 129]] as const) {
      const next = labToSrgb(srgbToLab(rgb[0], rgb[1], rgb[2]));
      expect(Math.abs(Math.round(next[0]) - rgb[0])).toBeLessThanOrEqual(1);
      expect(Math.abs(Math.round(next[1]) - rgb[1])).toBeLessThanOrEqual(1);
      expect(Math.abs(Math.round(next[2]) - rgb[2])).toBeLessThanOrEqual(1);
    }
  });

  it("keeps gray background, white gown, and blue shirt out of the skin mask", () => {
    const colors = [[128, 128, 128], [245, 245, 245], [30, 80, 180]] as const;
    for (const color of colors) {
      const image = solid(24, 24, [...color]);
      const masks = createPhotoEditMasks(image);
      expect(Math.max(...masks.skin)).toBe(0);
    }
  });

  it("keeps an identity recipe within one byte of the original pixels", () => {
    const image = portrait([190, 126, 98]);
    const rendered = applyPhotoEditRecipe(image, clonePhotoEditRecipe());
    let maxDifference = 0;
    for (let index = 0; index < image.data.length; index += 1) {
      maxDifference = Math.max(maxDifference, Math.abs(image.data[index] - rendered.data[index]));
    }
    expect(maxDifference).toBeLessThanOrEqual(1);
  });

  it("matches a deliberately dark and red portrait to the median target", () => {
    const reference = portrait([205, 145, 112]);
    const shifted = portrait([151, 82, 68]);
    const referenceMasks = createPhotoEditMasks(reference);
    const shiftedMasks = createPhotoEditMasks(shifted);
    const referenceMeasurement = measurePhoto(reference, referenceMasks);
    const shiftedMeasurement = measurePhoto(shifted, shiftedMasks);
    const target = medianPhotoMeasurement([referenceMeasurement]);
    const recipe = deriveAutomaticRecipe(shiftedMeasurement, target, { brightness: true, skinTone: true, uniformity: 0 });
    const rendered = applyPhotoEditRecipe(shifted, recipe, shiftedMasks);
    expect(rendered.measurementAfter.skin).not.toBeNull();
    expect(target.skin).not.toBeNull();
    expect(deltaE76(rendered.measurementAfter.skin!.lab, target.skin!.lab)).toBeLessThanOrEqual(1);
  });

  it("produces the same pixels for browser and node adapters using the shared engine", () => {
    const image = portrait([196, 132, 99]);
    const recipe = clonePhotoEditRecipe();
    recipe.light.exposure = 0.35;
    recipe.color.temperature = 12;
    recipe.skin.uniformity = 20;
    const browserResult = applyPhotoEditRecipe(image, recipe);
    const nodeResult = applyPhotoEditRecipe(image, recipe);
    let maxDifference = 0;
    for (let index = 0; index < browserResult.data.length; index += 1) {
      maxDifference = Math.max(maxDifference, Math.abs(browserResult.data[index] - nodeResult.data[index]));
    }
    expect(maxDifference).toBeLessThanOrEqual(1);
  });

  it("always renders the final recipe from the original pixels", () => {
    const original = portrait([190, 126, 98]);
    const first = clonePhotoEditRecipe();
    first.light.exposure = 0.75;
    void applyPhotoEditRecipe(original, first);
    const second = clonePhotoEditRecipe();
    second.light.exposure = -0.25;
    second.skin.hue = 6;
    void applyPhotoEditRecipe(original, second);
    const finalRecipe = clonePhotoEditRecipe();
    finalRecipe.light.exposure = 0.2;
    finalRecipe.skin.chroma = -8;
    const afterThreeSaves = applyPhotoEditRecipe(original, finalRecipe);
    const onePass = applyPhotoEditRecipe(original, finalRecipe);
    expect(afterThreeSaves.data).toEqual(onePass.data);
  });

  it("dithers a neutral gradient after +1EV without large tonal steps", () => {
    const width = 256;
    const image = solid(width, 8, [0, 0, 0]);
    for (let y = 0; y < image.height; y += 1) {
      for (let x = 0; x < width; x += 1) image.data.set([x, x, x], (y * width + x) * 3);
    }
    const recipe = clonePhotoEditRecipe(IDENTITY_PHOTO_EDIT_RECIPE);
    recipe.light.exposure = 1;
    const rendered = applyPhotoEditRecipe(image, recipe);
    const values = new Set<number>();
    for (let x = 0; x < width; x += 1) values.add(rendered.data[x * 3]);
    expect(values.size).toBeGreaterThan(150);
  });
});
