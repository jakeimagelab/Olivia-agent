export function releaseObjectUrl(url: string | null | undefined): void {
  if (url) URL.revokeObjectURL(url);
}

export async function loadBrowserThumbnail(file: File, size = 120): Promise<string | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      const scale = Math.min(size / image.width, size / image.height, 1);
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(image.width * scale);
      canvas.height = Math.round(image.height * scale);
      canvas.getContext("2d")?.drawImage(image, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((blob) => {
        releaseObjectUrl(url);
        resolve(blob ? URL.createObjectURL(blob) : null);
      }, "image/jpeg", 0.6);
    };
    image.onerror = () => {
      releaseObjectUrl(url);
      resolve(null);
    };
    image.src = url;
  });
}
