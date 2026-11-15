/// <reference lib="webworker" />

import { applyPhotoEditRecipe, type PhotoEditRecipe } from "@/lib/photo-edit";

type PreviewRequest = {
  id: number;
  data: ArrayBuffer;
  width: number;
  height: number;
  recipe: PhotoEditRecipe;
  showSkinMask: boolean;
};

let pending: PreviewRequest | null = null;
let scheduled = false;

function renderLatest() {
  scheduled = false;
  const request = pending;
  pending = null;
  if (!request) return;
  const { id, data, width, height, recipe, showSkinMask } = request;
  try {
    const rendered = applyPhotoEditRecipe({ data: new Uint8Array(data), width, height }, recipe);
    if (showSkinMask) {
      for (let index = 0; index < rendered.masks.skin.length; index += 1) {
        const weight = rendered.masks.skin[index] * 0.42;
        if (weight <= 0) continue;
        const offset = index * 3;
        rendered.data[offset] = Math.round(rendered.data[offset] * (1 - weight) + 79 * weight);
        rendered.data[offset + 1] = Math.round(rendered.data[offset + 1] * (1 - weight) + 216 * weight);
        rendered.data[offset + 2] = Math.round(rendered.data[offset + 2] * (1 - weight) + 184 * weight);
      }
    }
    self.postMessage({ id, ok: true, data: rendered.data.buffer, width, height, measurementAfter: rendered.measurementAfter }, [rendered.data.buffer]);
  } catch (error) {
    self.postMessage({ id, ok: false, error: error instanceof Error ? error.message : "미리보기를 만들지 못했습니다." });
  }
  if (pending && !scheduled) {
    scheduled = true;
    setTimeout(renderLatest, 0);
  }
}

self.onmessage = (event: MessageEvent<PreviewRequest>) => {
  pending = event.data;
  if (scheduled) return;
  scheduled = true;
  setTimeout(renderLatest, 0);
};

export {};
