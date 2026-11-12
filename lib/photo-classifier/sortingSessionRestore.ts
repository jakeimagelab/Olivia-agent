import { CAMERA_JPG_EXTENSIONS, RAW_PHOTO_EXTENSIONS } from "@/lib/photo/extensions";
import type { SavedSortingSession } from "@/lib/photo-classifier/sortingSession";
import type { FieldScene, SceneFile } from "@/lib/photo-classifier/types";

type SavedSceneSummary = SavedSortingSession["sceneSummary"][number];

function restoredFieldScene(
  scene: SavedSceneSummary,
  files: SceneFile[],
  sceneDir: FileSystemDirectoryHandle | null,
  fileCount = files.length,
): FieldScene {
  return {
    index: scene.index,
    folderName: scene.folderName,
    editedName: scene.editedName,
    startTime: scene.startTime,
    endTime: scene.endTime,
    fileCount,
    files,
    sceneDir,
    sceneType: scene.sceneType as FieldScene["sceneType"],
    suggestedName: scene.suggestedName,
    aiConfidence: scene.aiConfidence,
    aiReason: scene.aiReason,
    subScenes: [],
    profileCount: 0,
    qualityRejectCount: 0,
    nameLoading: false,
    boundaryBefore: scene.boundaryBefore,
    approved: scene.approved,
  };
}

export async function restoreMovedSortingScenes(
  jpgBase: FileSystemDirectoryHandle,
  sceneSummary: SavedSortingSession["sceneSummary"],
): Promise<FieldScene[]> {
  const scenes: FieldScene[] = [];
  for (const scene of sceneSummary) {
    const sceneDir = await jpgBase.getDirectoryHandle(scene.folderName).catch(() => null);
    const files: SceneFile[] = [];
    if (sceneDir) {
      for await (const [fileName, entry] of (sceneDir as any).entries()) {
        const extension = String(fileName).split(".").pop()?.toLowerCase() ?? "";
        if ((entry as FileSystemHandle).kind !== "file" || !CAMERA_JPG_EXTENSIONS.has(extension)) continue;
        files.push({
          name: String(fileName),
          basename: String(fileName).replace(/\.[^.]+$/, ""),
          handle: entry as FileSystemFileHandle,
          mtime: scene.startTime,
        });
      }
      files.sort((left, right) => left.name.localeCompare(right.name));
    }
    scenes.push(restoredFieldScene(
      scene,
      files,
      sceneDir,
      files.length || scene.fileCount,
    ));
  }
  return scenes;
}

export function canRestoreUnmovedSortingSession(saved: SavedSortingSession): boolean {
  return saved.version === 2
    && saved.sceneSummary.every((scene) => Array.isArray(scene.fileNames));
}

export async function restoreUnmovedSortingScenes(
  root: FileSystemDirectoryHandle,
  sceneSummary: SavedSortingSession["sceneSummary"],
): Promise<{
  rawFiles: Array<{ name: string; handle: FileSystemFileHandle }>;
  scenes: FieldScene[];
}> {
  const jpgFiles = new Map<string, { handle: FileSystemFileHandle; file: File }>();
  const rawFiles: Array<{ name: string; handle: FileSystemFileHandle }> = [];

  for await (const [rawName, entry] of (root as any).entries()) {
    if ((entry as FileSystemHandle).kind !== "file") continue;
    const name = String(rawName);
    const extension = name.split(".").pop()?.toLowerCase() ?? "";
    if (RAW_PHOTO_EXTENSIONS.has(extension)) {
      rawFiles.push({ name, handle: entry as FileSystemFileHandle });
    }
    if (CAMERA_JPG_EXTENSIONS.has(extension)) {
      const handle = entry as FileSystemFileHandle;
      jpgFiles.set(name, { handle, file: await handle.getFile() });
    }
  }

  const scenes = sceneSummary.map((scene) => {
    const files: SceneFile[] = (scene.fileNames ?? []).flatMap((name) => {
      const found = jpgFiles.get(name);
      return found ? [{
        name,
        basename: name.replace(/\.[^.]+$/, ""),
        handle: found.handle,
        mtime: found.file.lastModified,
        thumbUrl: null,
      }] : [];
    });
    return restoredFieldScene(scene, files, null);
  });

  return { rawFiles, scenes };
}
