import { copyFileHandle, renameDirHandle, type SplitRawFile } from "./browserFileOps";
import { loadThumb } from "./browserProcessing";
import { clearClassificationCheckpoint } from "./scene-cache";
import type { AccuracyReport, SceneBoundaryDecision, SceneCorrection } from "./hybrid-types";
import type { FieldScene, SceneFile } from "./types";
import { makeCSV } from "./workspaceFormatting";

export type FieldFileOperation = {
  type: "copy_remove";
  category: "RAW" | "JPG";
  source: string;
  destination: string;
  status: "completed" | "failed";
  error?: string;
  at: string;
};

type FieldOutputProgress = {
  completed: number;
  total: number;
  message: string;
};

async function writeReport(
  reportDirectory: FileSystemDirectoryHandle,
  name: string,
  content: string,
): Promise<void> {
  const handle = await reportDirectory.getFileHandle(name, { create: true });
  const writer = await handle.createWritable();
  await writer.write(`﻿${content}`);
  await writer.close();
}

export async function executePlannedFieldOutput({
  rootDirectory,
  scenes,
  rawFiles,
  boundaryDecisions,
  sceneCorrections,
  accuracyReport,
  checkpointId,
  isCancelled,
  onProgress,
  copyFile = copyFileHandle,
  thumbnailLoader = loadThumb,
  clearCheckpoint = clearClassificationCheckpoint,
  now = () => new Date().toISOString(),
  onSuppressedError = (error) => console.error("[OLIVIA] Suppressed error", error),
}: {
  rootDirectory: FileSystemDirectoryHandle;
  scenes: readonly FieldScene[];
  rawFiles: readonly SplitRawFile[];
  boundaryDecisions: readonly SceneBoundaryDecision[];
  sceneCorrections: readonly SceneCorrection[];
  accuracyReport: AccuracyReport | null;
  checkpointId: string;
  isCancelled: () => boolean;
  onProgress?: (progress: FieldOutputProgress) => void;
  copyFile?: typeof copyFileHandle;
  thumbnailLoader?: (file: File, size?: number) => Promise<string | null>;
  clearCheckpoint?: (id: string) => Promise<void>;
  now?: () => string;
  onSuppressedError?: (error: unknown) => void;
}): Promise<{
  scenes: FieldScene[];
  jpgBaseDirectory: FileSystemDirectoryHandle;
  totalFiles: number;
  operations: FieldFileOperation[];
}> {
  const totalFiles = scenes.reduce((sum, scene) => sum + scene.fileCount, 0);
  const reportDirectory = await rootDirectory.getDirectoryHandle("REPORT", { create: true });
  const operations: FieldFileOperation[] = [];
  let completed = 0;
  let lastUpdate = Date.now();
  const flushJournal = () => writeReport(reportDirectory, "file_operation_journal.json", JSON.stringify({
    version: 1,
    root: rootDirectory.name,
    operations,
    updatedAt: now(),
  }, null, 2));

  const rawDirectory = await rootDirectory.getDirectoryHandle("RAW", { create: true });
  for (let index = 0; index < rawFiles.length; index += 1) {
    if (isCancelled()) break;
    const raw = rawFiles[index];
    if (index % 10 === 0 || Date.now() - lastUpdate > 300) {
      onProgress?.({ completed: index, total: rawFiles.length, message: `RAW 이동: ${raw.name}` });
      lastUpdate = Date.now();
    }
    try {
      await copyFile(raw.handle, rawDirectory, raw.name);
      await rootDirectory.removeEntry(raw.name).catch(onSuppressedError);
      operations.push({
        type: "copy_remove",
        category: "RAW",
        source: raw.name,
        destination: `RAW/${raw.name}`,
        status: "completed",
        at: now(),
      });
    } catch (error) {
      operations.push({
        type: "copy_remove",
        category: "RAW",
        source: raw.name,
        destination: `RAW/${raw.name}`,
        status: "failed",
        error: error instanceof Error ? error.message : String(error),
        at: now(),
      });
    }
    if (index % 10 === 0) await flushJournal();
  }

  const jpgBaseDirectory = await rootDirectory.getDirectoryHandle("JPG", { create: true });
  try {
    const selectDirectory = await rootDirectory.getDirectoryHandle("SELECT", { create: true });
    await selectDirectory.getDirectoryHandle("JPG_SELECT", { create: true });
  } catch (error) {
    onSuppressedError(error);
  }

  const updated = scenes.map((scene) => ({ ...scene }));
  for (let sceneIndex = 0; sceneIndex < updated.length; sceneIndex += 1) {
    if (isCancelled()) break;
    const scene = updated[sceneIndex];
    const targetName = scene.editedName;
    const sceneDirectory = await jpgBaseDirectory.getDirectoryHandle(targetName, { create: true });
    const newFiles: SceneFile[] = [];
    for (const entry of scene.files) {
      if (isCancelled()) break;
      if (completed % 20 === 0 || Date.now() - lastUpdate > 300) {
        onProgress?.({ completed, total: totalFiles, message: `${targetName}: ${entry.name}` });
        lastUpdate = Date.now();
      }
      try {
        await copyFile(entry.handle, sceneDirectory, entry.name);
        const destinationHandle = await sceneDirectory.getFileHandle(entry.name);
        await rootDirectory.removeEntry(entry.name).catch(onSuppressedError);
        const thumbUrl = newFiles.length < 4
          ? await thumbnailLoader(await destinationHandle.getFile(), 120)
          : null;
        newFiles.push({ ...entry, handle: destinationHandle, thumbUrl });
        operations.push({
          type: "copy_remove",
          category: "JPG",
          source: entry.name,
          destination: `JPG/${targetName}/${entry.name}`,
          status: "completed",
          at: now(),
        });
      } catch (error) {
        newFiles.push(entry);
        operations.push({
          type: "copy_remove",
          category: "JPG",
          source: entry.name,
          destination: `JPG/${targetName}/${entry.name}`,
          status: "failed",
          error: error instanceof Error ? error.message : String(error),
          at: now(),
        });
      }
      completed += 1;
      if (completed % 10 === 0) await flushJournal();
    }
    updated[sceneIndex] = {
      ...scene,
      folderName: targetName,
      sceneDir: sceneDirectory,
      files: newFiles,
    };
  }

  await flushJournal();
  await clearCheckpoint(checkpointId);
  await Promise.all([
    writeReport(reportDirectory, "scene_boundaries.json", JSON.stringify({
      version: 1,
      boundaries: boundaryDecisions,
      createdAt: now(),
    }, null, 2)),
    writeReport(reportDirectory, "scene_corrections.json", JSON.stringify({
      version: 1,
      corrections: sceneCorrections,
      createdAt: now(),
    }, null, 2)),
    writeReport(reportDirectory, "scene_corrections.csv", makeCSV(
      ["project_id", "boundary_index", "boundary_file", "previous_decision", "corrected_decision", "action", "reason", "created_at"],
      sceneCorrections.map((item) => [
        item.projectId,
        String(item.boundaryIndex),
        item.boundaryFileName,
        item.previousDecision,
        item.correctedDecision,
        item.action,
        item.reason ?? "",
        item.createdAt,
      ]),
    )),
    ...(accuracyReport ? [writeReport(reportDirectory, "scene_accuracy_report.json", JSON.stringify({
      ...accuracyReport,
      createdAt: now(),
    }, null, 2))] : []),
  ]);

  return { scenes: updated, jpgBaseDirectory, totalFiles, operations };
}

export async function renameConfirmedFieldScenes({
  scenes,
  jpgBaseDirectory,
  renameDirectory = renameDirHandle,
  onSuppressedError = (error) => console.error("[OLIVIA] Suppressed error", error),
}: {
  scenes: readonly FieldScene[];
  jpgBaseDirectory: FileSystemDirectoryHandle;
  renameDirectory?: typeof renameDirHandle;
  onSuppressedError?: (error: unknown) => void;
}): Promise<FieldScene[]> {
  const updated = [...scenes];
  for (let index = 0; index < updated.length; index += 1) {
    const scene = updated[index];
    if (scene.editedName === scene.folderName || !scene.sceneDir) continue;
    try {
      const newDirectory = await renameDirectory(jpgBaseDirectory, scene.folderName, scene.editedName, scene.sceneDir);
      const newFiles = scene.files.map((file) => ({ ...file }));
      for (const photo of newFiles) {
        try {
          photo.handle = await newDirectory.getFileHandle(photo.name);
        } catch (error) {
          onSuppressedError(error);
        }
      }
      updated[index] = {
        ...scene,
        folderName: scene.editedName,
        sceneDir: newDirectory,
        files: newFiles,
      };
    } catch (error) {
      onSuppressedError(error);
    }
  }
  return updated;
}
