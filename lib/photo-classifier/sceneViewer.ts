export type SceneEdgePreviewItem = {
  fileIndex: number;
  label: "시작" | "끝" | "시작·끝";
};

export type SceneViewerObjectUrl = {
  objectUrl: string;
  revoke: () => void;
};

type SceneViewerUrlApi = {
  createObjectURL: (file: Blob) => string;
  revokeObjectURL: (url: string) => void;
};

export function getSceneEdgePreviewItems(fileCount: number): SceneEdgePreviewItem[] {
  if (fileCount <= 0) return [];
  if (fileCount === 1) return [{ fileIndex: 0, label: "시작·끝" }];
  return [
    { fileIndex: 0, label: "시작" },
    { fileIndex: fileCount - 1, label: "끝" },
  ];
}

export function clampSceneViewerIndex(index: number, fileCount: number): number {
  if (fileCount <= 0) return 0;
  return Math.max(0, Math.min(Math.trunc(index), fileCount - 1));
}

export function moveSceneViewerIndex(
  currentIndex: number,
  direction: -1 | 1,
  fileCount: number,
): number {
  return clampSceneViewerIndex(currentIndex + direction, fileCount);
}

export function canSplitSceneAt(fileIndex: number): boolean {
  return fileIndex > 0;
}

export function formatSceneViewerTime(timestamp: number): string {
  const date = new Date(timestamp);
  return [date.getHours(), date.getMinutes(), date.getSeconds()]
    .map((value) => String(value).padStart(2, "0"))
    .join(":");
}

export async function createSceneViewerObjectUrl(
  handle: FileSystemFileHandle,
  urlApi: SceneViewerUrlApi = URL,
): Promise<SceneViewerObjectUrl> {
  const file = await handle.getFile();
  const objectUrl = urlApi.createObjectURL(file);
  let revoked = false;

  return {
    objectUrl,
    revoke: () => {
      if (revoked) return;
      revoked = true;
      urlApi.revokeObjectURL(objectUrl);
    },
  };
}
