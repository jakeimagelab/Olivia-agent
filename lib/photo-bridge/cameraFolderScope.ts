import {
  bridgeFileKind,
  scanBridgeFolder,
  type BridgeFolderScan,
  type BridgeJpgFile,
} from "@/lib/photo-bridge/bridgeFiles";
import { isDeliveredRoundFolder } from "@/lib/photo-bridge/rawMatchDelivery";
import type { BridgeFolderTrailItem } from "@/lib/photo-bridge/recentFolder";
import { isCameraGeneratedFolderName } from "@/lib/photo-classifier/departmentResolver";
import { isHiddenSystemFile } from "@/lib/photo/extensions";

type BridgeFolderScanner = (
  directory: FileSystemDirectoryHandle,
  folderPath: string,
  options: { includeNestedJpgs: boolean; maxDepth: number },
) => Promise<BridgeFolderScan>;

function isJpgIntegratedFolder(name: string): boolean {
  return name.normalize("NFC").trim().toLocaleUpperCase("en-US") === "JPG전체";
}

function safeFolderPrefix(path: string): string {
  return path
    .normalize("NFC")
    .replace(/[\\/:*?"<>|\s]+/gu, "_")
    .replace(/^_+|_+$/gu, "") || "CAMERA";
}

function uniqueCameraOutputNames(jpgs: readonly BridgeJpgFile[]): BridgeJpgFile[] {
  const counts = new Map<string, number>();
  for (const photo of jpgs) {
    const key = (photo.sourceName ?? photo.name).normalize("NFC").toLocaleLowerCase("en-US");
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const reserved = new Set<string>();
  return jpgs.map((photo) => {
    const sourceName = photo.sourceName ?? photo.name;
    const key = sourceName.normalize("NFC").toLocaleLowerCase("en-US");
    let outputName = sourceName;
    if ((counts.get(key) ?? 0) > 1) {
      const prefix = safeFolderPrefix(photo.relativeDirectory);
      outputName = `${prefix}_${sourceName}`;
    }
    const extensionIndex = outputName.lastIndexOf(".");
    const stem = extensionIndex > 0 ? outputName.slice(0, extensionIndex) : outputName;
    const extension = extensionIndex > 0 ? outputName.slice(extensionIndex) : "";
    let uniqueName = outputName;
    let suffix = 2;
    while (reserved.has(uniqueName.normalize("NFC").toLocaleLowerCase("en-US"))) {
      uniqueName = `${stem}_${suffix}${extension}`;
      suffix += 1;
    }
    reserved.add(uniqueName.normalize("NFC").toLocaleLowerCase("en-US"));
    return { ...photo, classificationName: uniqueName, sourceName };
  });
}

async function inspectJpgRoot(directory: FileSystemDirectoryHandle) {
  const cameraDirectories: FileSystemDirectoryHandle[] = [];
  let directJpgCount = 0;
  let meaningfulDirectoryCount = 0;
  for await (const [name, handle] of (directory as FileSystemDirectoryHandle & {
    entries(): AsyncIterableIterator<[string, FileSystemHandle]>;
  }).entries()) {
    if (isHiddenSystemFile(name) || isDeliveredRoundFolder(name)) continue;
    if (handle.kind === "file") {
      if (bridgeFileKind(name) === "jpg") directJpgCount += 1;
      continue;
    }
    if (isCameraGeneratedFolderName(name)) cameraDirectories.push(handle as FileSystemDirectoryHandle);
    else meaningfulDirectoryCount += 1;
  }
  cameraDirectories.sort((left, right) => left.name.localeCompare(right.name, "ko", { numeric: true, sensitivity: "base" }));
  return { cameraDirectories, directJpgCount, meaningfulDirectoryCount };
}

export async function scanBridgeCameraFolderScope({
  directory,
  trail,
  folderPath,
  scanFolder = scanBridgeFolder,
}: {
  directory: FileSystemDirectoryHandle;
  trail: readonly BridgeFolderTrailItem[];
  folderPath: string;
  scanFolder?: BridgeFolderScanner;
}): Promise<BridgeFolderScan | null> {
  const active = trail.at(-1);
  const parent = trail.at(-2);
  const activeIsCameraChild = Boolean(
    active
    && parent
    && isCameraGeneratedFolderName(active.name)
    && isJpgIntegratedFolder(parent.name),
  );
  const activeIsJpgRoot = Boolean(active && isJpgIntegratedFolder(active.name));
  if (!activeIsCameraChild && !activeIsJpgRoot) return null;

  const outputDirectory = activeIsCameraChild ? parent!.handle : directory;
  const outputFolderPath = trail
    .slice(0, activeIsCameraChild ? -1 : undefined)
    .map((item) => item.name)
    .join(" / ");
  const inspected = await inspectJpgRoot(outputDirectory);
  if (!inspected.cameraDirectories.length) return null;
  if (activeIsJpgRoot && (inspected.directJpgCount > 0 || inspected.meaningfulDirectoryCount > 0)) return null;

  const scans = await Promise.all(inspected.cameraDirectories.map(async (sourceDirectory) => {
    const scan = await scanFolder(sourceDirectory, `${outputFolderPath || folderPath}/${sourceDirectory.name}`, {
      includeNestedJpgs: true,
      maxDepth: 2,
    });
    const prefix = sourceDirectory.name.normalize("NFC");
    return {
      ...scan,
      jpgs: scan.jpgs.map((photo) => {
        const relativeDirectory = photo.relativeDirectory
          ? `${prefix}/${photo.relativeDirectory}`
          : prefix;
        return {
          ...photo,
          sourceName: photo.sourceName ?? photo.name,
          relativeDirectory,
          relativePath: `${relativeDirectory}/${photo.sourceName ?? photo.name}`,
        };
      }),
    };
  }));

  const jpgs = uniqueCameraOutputNames(scans.flatMap((scan) => scan.jpgs));
  jpgs.sort((left, right) => left.relativePath.localeCompare(right.relativePath, "ko", { numeric: true, sensitivity: "base" }));
  return {
    folders: inspected.cameraDirectories,
    jpgs,
    raws: [],
    sidecars: [],
    ignoredCount: scans.reduce((sum, scan) => sum + scan.ignoredCount, 0),
    nestedJpgCount: jpgs.length,
    unreadableFolderCount: scans.reduce((sum, scan) => sum + scan.unreadableFolderCount, 0),
    classificationScope: {
      outputDirectory,
      folderPath: trail.map((item) => item.name),
      sourceFolderNames: inspected.cameraDirectories.map((item) => item.name),
    },
  };
}
