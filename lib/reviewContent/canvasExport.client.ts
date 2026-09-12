import type { ReviewStoryDocument } from "./storyDocument";
import { reviewCanvasCaptureSize } from "./canvasLayout";

function imageName(image: HTMLImageElement) {
  return image.dataset.reviewAssetName || image.alt || image.currentSrc || image.src || "이미지";
}

function waitForImageLoad(image: HTMLImageElement) {
  if (image.complete) return Promise.resolve();
  return new Promise<void>((resolve, reject) => {
    const cleanup = () => {
      image.removeEventListener("load", onLoad);
      image.removeEventListener("error", onError);
    };
    const onLoad = () => { cleanup(); resolve(); };
    const onError = () => { cleanup(); reject(new Error(`${imageName(image)} 자산을 불러오지 못했습니다.`)); };
    image.addEventListener("load", onLoad, { once: true });
    image.addEventListener("error", onError, { once: true });
  });
}

export async function waitForCanvasResources(root: HTMLElement) {
  await document.fonts.ready;
  const images = Array.from(root.querySelectorAll("img"));
  await Promise.all(images.map(async (image) => {
    await waitForImageLoad(image);
    if (!image.naturalWidth || !image.naturalHeight) {
      throw new Error(`${imageName(image)} 자산이 올바른 이미지가 아닙니다.`);
    }
    if (typeof image.decode === "function") {
      await image.decode().catch(() => {
        throw new Error(`${imageName(image)} 자산의 디코딩을 완료하지 못했습니다.`);
      });
    }
  }));
}

export async function captureReviewCanvas(root: HTMLElement, documentValue: ReviewStoryDocument, targetWidthPx: number) {
  await waitForCanvasResources(root);
  const expected = reviewCanvasCaptureSize(documentValue, targetWidthPx);
  const { default: html2canvas } = await import("html2canvas");
  const canvas = await html2canvas(root, {
    scale: expected.scale,
    width: documentValue.width,
    height: documentValue.height,
    useCORS: true,
    backgroundColor: null,
    logging: false,
  });
  if (canvas.width !== expected.width || canvas.height !== expected.height) {
    throw new Error(`PNG 크기가 올바르지 않습니다. (${canvas.width}×${canvas.height})`);
  }
  return canvas;
}
