import { extractVisualFeaturesFromImageData } from "../visual-feature";

type FeatureWorkerRequest = { id: number; file: File; maxSize?: number };
type FeatureWorkerResponse = {
  id: number;
  ok: boolean;
  features?: ReturnType<typeof extractVisualFeaturesFromImageData>;
  error?: string;
};

const workerScope = self as unknown as {
  onmessage: ((event: MessageEvent<FeatureWorkerRequest>) => void) | null;
  postMessage(message: FeatureWorkerResponse): void;
};

workerScope.onmessage = async (event) => {
  const { id, file, maxSize = 384 } = event.data;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = new OffscreenCanvas(width, height);
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("이미지 분석 Canvas를 만들 수 없습니다.");
    context.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();
    const features = extractVisualFeaturesFromImageData(context.getImageData(0, 0, width, height));
    workerScope.postMessage({ id, ok: true, features });
  } catch (error) {
    workerScope.postMessage({ id, ok: false, error: error instanceof Error ? error.message : String(error) });
  }
};

export {};
