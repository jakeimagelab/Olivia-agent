import { METADATA_SELECT_JPG_EXTENSIONS } from "@/lib/metadataSelect/matcher";
import {
  buildCustomPrefixFilename,
  buildParentPrefixFilename,
  buildTemplateFilename,
  hasFilenamePrefix,
  type RenameMode,
  type TemplateRenameSettings,
} from "./naming";

export type RenameTransferMode = "same-folder" | "move" | "copy";
export type RenamePreviewStatus = "READY" | "SKIP" | "DUPLICATE" | "ERROR";

export type RenameSettings = {
  mode: RenameMode;
  template: TemplateRenameSettings;
  customText: string;
  includeSubdirectories: boolean;
  transferMode: RenameTransferMode;
};

export type RenameSourceFile = {
  name: string;
  path: string;
  parent: FileSystemDirectoryHandle;
  handle: FileSystemFileHandle;
};

export type RenamePlanRow = RenameSourceFile & {
  targetName: string;
  targetDirectory: FileSystemDirectoryHandle;
  status: RenamePreviewStatus;
  message: string;
};

export type RenamePlan = {
  rows: RenamePlanRow[];
  discoveredCount: number;
  readyCount: number;
  skipCount: number;
  duplicateCount: number;
  errorCount: number;
  blocked: boolean;
};

const collator = new Intl.Collator("ko-KR", { numeric: true, sensitivity: "base" });

function normalizedName(name: string): string {
  return name.normalize("NFC").toLocaleLowerCase("en-US");
}

function isNotFound(error: unknown): boolean {
  return !!error
    && typeof error === "object"
    && "name" in error
    && (error as { name?: unknown }).name === "NotFoundError";
}

async function fileExists(directory: FileSystemDirectoryHandle, name: string): Promise<boolean> {
  try {
    await (directory as any).getFileHandle(name);
    return true;
  } catch (error) {
    if (isNotFound(error)) return false;
    throw error;
  }
}

function isPhoto(name: string): boolean {
  const extension = name.split(".").pop()?.toLowerCase() ?? "";
  return METADATA_SELECT_JPG_EXTENSIONS.has(extension);
}

/** Directory iteration order differs by browser/filesystem. Preview and execution share this sorted list. */
export async function collectRenameSourceFiles(
  root: FileSystemDirectoryHandle,
  includeSubdirectories: boolean,
): Promise<RenameSourceFile[]> {
  const output: RenameSourceFile[] = [];

  const walk = async (directory: FileSystemDirectoryHandle, prefix: string): Promise<void> => {
    const entries: Array<[string, FileSystemHandle]> = [];
    for await (const entry of (directory as any).entries() as AsyncIterable<[string, FileSystemHandle]>) entries.push(entry);
    entries.sort(([left], [right]) => collator.compare(left, right));

    for (const [name, handle] of entries) {
      if (handle.kind === "directory") {
        if (includeSubdirectories) await walk(handle as FileSystemDirectoryHandle, prefix ? `${prefix}/${name}` : name);
        continue;
      }
      if (!isPhoto(name)) continue;
      output.push({
        name,
        path: prefix ? `${prefix}/${name}` : name,
        parent: directory,
        handle: handle as FileSystemFileHandle,
      });
    }
  };

  await walk(root, "");
  return output;
}

function planFilename(source: RenameSourceFile, settings: RenameSettings, sequenceIndex: number): Pick<RenamePlanRow, "targetName" | "status" | "message"> {
  if (settings.mode === "template") {
    if (!settings.template.text.trim()) return { targetName: source.name, status: "ERROR", message: "일반 이름 변경의 텍스트를 입력해주세요." };
    return {
      targetName: buildTemplateFilename(source.name, settings.template, sequenceIndex),
      status: "READY",
      message: "변경 예정",
    };
  }

  if (settings.mode === "parent-prefix") {
    if (hasFilenamePrefix(source.name, source.parent.name)) return { targetName: source.name, status: "SKIP", message: "직속 부모 폴더명이 이미 붙어 있습니다." };
    return {
      targetName: buildParentPrefixFilename(source.parent.name, source.name),
      status: "READY",
      message: "직속 부모 폴더명 추가",
    };
  }

  if (!settings.customText.trim()) return { targetName: source.name, status: "ERROR", message: "앞에 붙일 텍스트를 입력해주세요." };
  if (hasFilenamePrefix(source.name, settings.customText.trim())) return { targetName: source.name, status: "SKIP", message: "같은 텍스트가 이미 붙어 있습니다." };
  return {
    targetName: buildCustomPrefixFilename(settings.customText, source.name),
    status: "READY",
    message: "직접 입력한 텍스트 추가",
  };
}

export async function buildRenamePlan({
  root,
  destination,
  settings,
}: {
  root: FileSystemDirectoryHandle;
  destination: FileSystemDirectoryHandle | null;
  settings: RenameSettings;
}): Promise<RenamePlan> {
  const sourceFiles = await collectRenameSourceFiles(root, settings.includeSubdirectories);
  const rows = sourceFiles.map((source, sequenceIndex): RenamePlanRow => {
    const filename = planFilename(source, settings, sequenceIndex);
    return {
      ...source,
      ...filename,
      targetDirectory: settings.transferMode === "same-folder" ? source.parent : destination ?? source.parent,
    };
  });

  if (settings.transferMode !== "same-folder" && !destination) {
    for (const row of rows) {
      if (row.status === "READY") {
        row.status = "ERROR";
        row.message = "목적지 폴더를 선택해주세요.";
      }
    }
  }

  const directoryIds = new Map<FileSystemDirectoryHandle, number>();
  let nextDirectoryId = 0;
  const directoryId = (directory: FileSystemDirectoryHandle) => {
    const existing = directoryIds.get(directory);
    if (existing !== undefined) return existing;
    const value = nextDirectoryId++;
    directoryIds.set(directory, value);
    return value;
  };
  const groups = new Map<string, RenamePlanRow[]>();
  for (const row of rows) {
    if (row.status !== "READY") continue;
    const key = `${directoryId(row.targetDirectory)}:${normalizedName(row.targetName)}`;
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    for (const row of group) {
      row.status = "DUPLICATE";
      row.message = "변경 대상끼리 같은 파일명이 됩니다.";
    }
  }

  for (const row of rows) {
    if (row.status !== "READY") continue;
    try {
      if (await fileExists(row.targetDirectory, row.targetName)) {
        row.status = "DUPLICATE";
        row.message = "대상 폴더에 같은 파일명이 이미 있습니다.";
      }
    } catch (error) {
      row.status = "ERROR";
      row.message = error instanceof Error ? error.message : "대상 폴더를 확인하지 못했습니다.";
    }
  }

  const count = (status: RenamePreviewStatus) => rows.filter((row) => row.status === status).length;
  const duplicateCount = count("DUPLICATE");
  const errorCount = count("ERROR");
  return {
    rows,
    discoveredCount: rows.length,
    readyCount: count("READY"),
    skipCount: count("SKIP"),
    duplicateCount,
    errorCount,
    blocked: duplicateCount > 0 || errorCount > 0,
  };
}
