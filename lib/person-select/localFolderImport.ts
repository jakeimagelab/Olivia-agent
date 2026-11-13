import { isDeliveredRoundFolder } from "@/lib/photo-bridge/rawMatchDelivery";
import { classifyPersonFolderName, normalizeNfc, PERSON_FOLDER_JPG_DIRECTORIES } from "./folderRules";
import {
  isPersonSelectJpegFile,
  isPersonSelectSchoolMappingFolder,
  scanLocalPersonSelectFiles,
  type LocalPersonSelectSource,
  type PersonSelectImportLayout,
} from "./localImportRecords";

type DirectoryWithEntries = FileSystemDirectoryHandle & {
  entries(): AsyncIterableIterator<[string, FileSystemHandle]>;
};

async function jpgFilesIn(directory: FileSystemDirectoryHandle, prefix: string) {
  const files: LocalPersonSelectSource[] = [];
  for await (const [name, handle] of (directory as DirectoryWithEntries).entries()) {
    if (handle.kind !== "file" || name.startsWith(".") || !isPersonSelectJpegFile(name)) continue;
    files.push({ file: await (handle as FileSystemFileHandle).getFile(), relativePath: `${prefix}/${normalizeNfc(name)}` });
  }
  return files;
}

async function jpgFilesRecursive(directory: FileSystemDirectoryHandle, prefix = ""): Promise<LocalPersonSelectSource[]> {
  const files: LocalPersonSelectSource[] = [];
  for await (const [name, handle] of (directory as DirectoryWithEntries).entries()) {
    if (name.startsWith(".")) continue;
    const path = prefix ? `${prefix}/${normalizeNfc(name)}` : normalizeNfc(name);
    if (handle.kind === "file" && isPersonSelectJpegFile(name)) files.push({ file: await (handle as FileSystemFileHandle).getFile(), relativePath: path });
    else if (handle.kind === "directory" && !isDeliveredRoundFolder(name)) files.push(...await jpgFilesRecursive(handle as FileSystemDirectoryHandle, path));
  }
  return files;
}

export async function collectLocalPersonSelectFolder(root: FileSystemDirectoryHandle, layout: PersonSelectImportLayout) {
  if (layout === "project") {
    const sources = await jpgFilesRecursive(root);
    return { folderName: normalizeNfc(root.name), scan: scanLocalPersonSelectFiles(sources, layout) };
  }
  const sources: LocalPersonSelectSource[] = [];
  const topLevelFolders: string[] = [];
  for await (const [rootName, rootHandle] of (root as DirectoryWithEntries).entries()) {
    if (rootHandle.kind !== "directory") continue;
    const normalizedRootName = normalizeNfc(rootName);
    topLevelFolders.push(normalizedRootName);
    if (layout === "school") {
      if (!isPersonSelectSchoolMappingFolder(normalizedRootName)) continue;
      for await (const [ownerName, ownerHandle] of (rootHandle as DirectoryWithEntries).entries()) {
        if (ownerHandle.kind !== "directory" || ownerName.startsWith(".")) continue;
        sources.push(...await jpgFilesIn(ownerHandle as FileSystemDirectoryHandle, `${normalizedRootName}/${normalizeNfc(ownerName)}`));
      }
      continue;
    }

    const kind = classifyPersonFolderName(normalizedRootName);
    if (kind.kind !== "person") continue;
    const direct = await jpgFilesIn(rootHandle as FileSystemDirectoryHandle, normalizedRootName);
    const childDirectories = new Map<string, FileSystemDirectoryHandle>();
    for await (const [childName, childHandle] of (rootHandle as DirectoryWithEntries).entries()) {
      if (childHandle.kind === "directory") childDirectories.set(normalizeNfc(childName).toLocaleLowerCase("ko-KR"), childHandle as FileSystemDirectoryHandle);
    }
    let preferred: LocalPersonSelectSource[] = [];
    for (const directory of PERSON_FOLDER_JPG_DIRECTORIES) {
      const handle = childDirectories.get(directory.toLocaleLowerCase("ko-KR"));
      if (!handle) continue;
      const found = await jpgFilesIn(handle, `${normalizedRootName}/${directory}`);
      if (found.length) { preferred = found; break; }
    }
    sources.push(...(preferred.length ? preferred : direct));
  }
  return { folderName: normalizeNfc(root.name), scan: scanLocalPersonSelectFiles(sources, layout, topLevelFolders) };
}

export function collectLocalPersonSelectFileList(fileList: FileList, layout: PersonSelectImportLayout) {
  const files = Array.from(fileList);
  const roots = new Set(files.map((file) => normalizeNfc(file.webkitRelativePath.replace(/\\/g, "/").split("/")[0] ?? "")).filter(Boolean));
  if (roots.size !== 1) throw new Error("사진이 들어 있는 폴더 하나를 선택해 주세요.");
  const folderName = [...roots][0];
  const sources = files.flatMap((file) => {
    const path = normalizeNfc(file.webkitRelativePath.replace(/\\/g, "/"));
    const segments = path.split("/");
    if (segments[0] === folderName) segments.shift();
    return isPersonSelectJpegFile(file.name) && !segments.some(isDeliveredRoundFolder) ? [{ file, relativePath: segments.join("/") }] : [];
  });
  const topLevelFolders = [...new Set(sources.map((source) => source.relativePath.split("/")[0]).filter(Boolean))];
  return { folderName, scan: scanLocalPersonSelectFiles(sources, layout, topLevelFolders) };
}
