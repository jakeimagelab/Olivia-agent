import { copyFileHandle } from "./browserFileOps";
import type { StudioReportFile } from "./studioReports";

export type StudioOutputGroupPlan = {
  folderName: string;
  files: Array<{
    name: string;
    handle: FileSystemFileHandle;
  }>;
};

type StudioOutputProgress = {
  completed: number;
  total: number;
  message: string;
};

type StudioOutputOptions = {
  rootDirectory: FileSystemDirectoryHandle;
  groups: readonly StudioOutputGroupPlan[];
  reports: readonly StudioReportFile[];
  mode: "copy" | "move";
  isCancelled: () => boolean;
  onProgress?: (progress: StudioOutputProgress) => void;
  onLog?: (log: string[]) => void;
  copyFile?: typeof copyFileHandle;
  onSuppressedError?: (error: unknown) => void;
};

export async function executeStudioOutput({
  rootDirectory,
  groups,
  reports,
  mode,
  isCancelled,
  onProgress,
  onLog,
  copyFile = copyFileHandle,
  onSuppressedError = (error) => console.error("[OLIVIA] Suppressed error", error),
}: StudioOutputOptions) {
  const outputDirectory = await rootDirectory.getDirectoryHandle(`분류_${rootDirectory.name}`, { create: true });
  const reportDirectory = await rootDirectory.getDirectoryHandle("AI_SELECT_REPORT", { create: true });
  const total = groups.reduce((sum, group) => sum + group.files.length, 0);
  const log: string[] = [];
  let completed = 0;

  for (const group of groups) {
    const groupDirectory = await outputDirectory.getDirectoryHandle(group.folderName, { create: true });
    for (const file of group.files) {
      if (isCancelled()) break;
      onProgress?.({ completed, total, message: `${group.folderName}: ${file.name}` });
      try {
        await copyFile(file.handle, groupDirectory, file.name);
        if (mode === "move") {
          await rootDirectory.removeEntry(file.name).catch(onSuppressedError);
        }
        log.push(`✅ ${file.name} → ${group.folderName}/`);
      } catch {
        log.push(`❌ ${file.name} 실패`);
      }
      completed += 1;
      onLog?.([...log]);
    }
  }

  for (const report of reports) {
    try {
      const fileHandle = await reportDirectory.getFileHandle(report.name, { create: true });
      const writer = await fileHandle.createWritable();
      await writer.write(`﻿${report.content}`);
      await writer.close();
    } catch (error) {
      onSuppressedError(error);
    }
  }

  return { completed, total, log };
}
