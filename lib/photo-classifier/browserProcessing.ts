import type { SceneProposal } from "@/lib/photo-classifier/pattern-analysis";

const AI_PREVIEW_MAX_SCENES = 24;

export async function loadThumb(file: File, size = 120): Promise<string | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      const scale = Math.min(size / image.width, size / image.height, 1);
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(image.width * scale);
      canvas.height = Math.round(image.height * scale);
      canvas.getContext("2d")?.drawImage(image, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL("image/jpeg", 0.6));
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    image.src = url;
  });
}

export async function buildQuickProposals(
  entries: { name: string; mtime: number; file: File }[],
  gapMinutes: number,
  thumbnailLoader: (file: File, size: number) => Promise<string | null> = loadThumb,
): Promise<SceneProposal[]> {
  if (!entries.length) return [];
  const gapMs = gapMinutes * 60 * 1000;
  const groups: (typeof entries)[] = [[entries[0]]];
  for (let index = 1; index < entries.length; index += 1) {
    if (entries[index].mtime - entries[index - 1].mtime > gapMs) groups.push([entries[index]]);
    else groups[groups.length - 1].push(entries[index]);
  }
  const limited = groups.slice(0, AI_PREVIEW_MAX_SCENES);
  return Promise.all(limited.map(async (group, index) => ({
    id: `quick-${index}`,
    startIndex: index,
    endIndex: index,
    fileCount: group.length,
    startTime: new Date(group[0].mtime).toISOString(),
    endTime: new Date(group[group.length - 1].mtime).toISOString(),
    representativeFiles: [await thumbnailLoader(group[0].file, 80)].filter((url): url is string => Boolean(url)),
    reasons: ["시간 간격 기준(예상)"],
  })));
}

export async function analyzeJpg(file: File): Promise<{ blurScore: number; brightness: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      const maxSize = 280;
      const scale = Math.min(maxSize / image.width, maxSize / image.height, 1);
      const width = Math.max(1, Math.round(image.width * scale));
      const height = Math.max(1, Math.round(image.height * scale));
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d");
      if (!context) {
        URL.revokeObjectURL(url);
        reject(new Error("canvas context unavailable"));
        return;
      }
      context.drawImage(image, 0, 0, width, height);
      const { data } = context.getImageData(0, 0, width, height);
      const gray = new Float32Array(width * height);
      let brightSum = 0;
      for (let index = 0; index < gray.length; index += 1) {
        const value = 0.299 * data[index * 4] + 0.587 * data[index * 4 + 1] + 0.114 * data[index * 4 + 2];
        gray[index] = value;
        brightSum += value;
      }
      const brightness = brightSum / gray.length;
      let lapSum = 0;
      let lapCount = 0;
      for (let y = 1; y < height - 1; y += 1) {
        for (let x = 1; x < width - 1; x += 1) {
          const center = y * width + x;
          const laplacian = gray[center] * 4
            - gray[(y - 1) * width + x]
            - gray[(y + 1) * width + x]
            - gray[y * width + (x - 1)]
            - gray[y * width + (x + 1)];
          lapSum += laplacian * laplacian;
          lapCount += 1;
        }
      }
      URL.revokeObjectURL(url);
      resolve({ blurScore: lapCount > 0 ? Math.sqrt(lapSum / lapCount) : 0, brightness });
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("load fail"));
    };
    image.src = url;
  });
}

export async function getApiThumb(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      const scale = Math.min(480 / image.width, 480 / image.height, 1);
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(image.width * scale);
      canvas.height = Math.round(image.height * scale);
      canvas.getContext("2d")?.drawImage(image, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL("image/jpeg", 0.6));
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("load fail"));
    };
    image.src = url;
  });
}

export async function getBoundaryApiImage(file: File, maxSize = 1080, quality = 0.82): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      const scale = Math.min(maxSize / Math.max(image.width, image.height), 1);
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(image.width * scale));
      canvas.height = Math.max(1, Math.round(image.height * scale));
      canvas.getContext("2d")?.drawImage(image, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL("image/jpeg", quality));
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error(`${file.name} 이미지 읽기 실패`));
    };
    image.src = url;
  });
}

export async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  const consume = async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await worker(items[index], index);
    }
  };
  await Promise.all(Array.from(
    { length: Math.max(1, Math.min(concurrency, items.length || 1)) },
    () => consume(),
  ));
  return results;
}

export async function getStudioThumb(file: File, maxSize = 480): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      const scale = Math.min(maxSize / image.width, maxSize / image.height, 1);
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(image.width * scale);
      canvas.height = Math.round(image.height * scale);
      canvas.getContext("2d")?.drawImage(image, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL("image/jpeg", 0.75));
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("load"));
    };
    image.src = url;
  });
}

export async function loadStudioPreviewMetrics(file: File, thumbnailSize = 100): Promise<{
  thumbUrl: string | null;
  brightness: number;
}> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      const scale = Math.min(thumbnailSize / image.width, thumbnailSize / image.height, 1);
      const thumbnailCanvas = document.createElement("canvas");
      thumbnailCanvas.width = Math.max(1, Math.round(image.width * scale));
      thumbnailCanvas.height = Math.max(1, Math.round(image.height * scale));
      thumbnailCanvas.getContext("2d")?.drawImage(image, 0, 0, thumbnailCanvas.width, thumbnailCanvas.height);

      const brightnessCanvas = document.createElement("canvas");
      brightnessCanvas.width = 64;
      brightnessCanvas.height = 64;
      const context = brightnessCanvas.getContext("2d");
      let brightness = 128;
      if (context) {
        context.drawImage(image, 0, 0, 64, 64);
        const data = context.getImageData(0, 0, 64, 64).data;
        let sum = 0;
        for (let index = 0; index < data.length; index += 4) {
          sum += 0.299 * data[index] + 0.587 * data[index + 1] + 0.114 * data[index + 2];
        }
        brightness = sum / (64 * 64);
      }
      const thumbUrl = thumbnailCanvas.toDataURL("image/jpeg", 0.6);
      URL.revokeObjectURL(url);
      resolve({ thumbUrl, brightness });
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      resolve({ thumbUrl: null, brightness: 128 });
    };
    image.src = url;
  });
}

export async function quickBrightness(file: File): Promise<number> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = 64;
      canvas.height = 64;
      const context = canvas.getContext("2d");
      if (!context) {
        URL.revokeObjectURL(url);
        resolve(128);
        return;
      }
      context.drawImage(image, 0, 0, 64, 64);
      const data = context.getImageData(0, 0, 64, 64).data;
      let sum = 0;
      for (let index = 0; index < data.length; index += 4) {
        sum += 0.299 * data[index] + 0.587 * data[index + 1] + 0.114 * data[index + 2];
      }
      URL.revokeObjectURL(url);
      resolve(sum / (64 * 64));
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(128);
    };
    image.src = url;
  });
}
