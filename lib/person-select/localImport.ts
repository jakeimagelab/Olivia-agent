import {
  classifyPersonFolderName,
  normalizeNfc,
  parseGroupFolderName,
  parsePersonFolderName,
  PERSON_FOLDER_JPG_DIRECTORIES,
} from "./folderRules";

export type PersonSelectImportLayout = "school" | "person-folders";

export type LocalPersonSelectSource = {
  file: File;
  relativePath: string;
};

export type LocalPersonSelectCandidate = LocalPersonSelectSource & {
  fileName: string;
  category: string;
  ownerName: string | null;
  ownerGroup: string | null;
};

export type LocalPersonSelectScan = {
  files: LocalPersonSelectCandidate[];
  skippedFolders: string[];
  groupFolders: string[];
  unnamedFolders: string[];
  emptyFolders: string[];
};

const JPG_FILE = /\.jpe?g$/i;
const SCHOOL_MAPPINGS = {
  "선생님프로필": { category: "profile", owner: "person" },
  "담임선생님": { category: "homeroom", owner: "group" },
} as const;

function pathSegments(value: string) {
  const normalized = normalizeNfc(value.replace(/\\/g, "/"));
  if (!normalized || normalized.startsWith("/") || normalized.includes("\0")) return null;
  const segments = normalized.split("/");
  if (segments.some((segment) => !segment || segment === "." || segment === ".." || segment.startsWith("."))) return null;
  return segments;
}

export function deriveLocalImportRecord(layout: PersonSelectImportLayout, relativePath: string) {
  const segments = pathSegments(relativePath);
  if (!segments || !JPG_FILE.test(segments.at(-1) ?? "")) return null;
  const fileName = segments.at(-1)!;

  if (layout === "person-folders") {
    if (segments.length !== 2 && segments.length !== 3) return null;
    const person = classifyPersonFolderName(segments[0]);
    if (person.kind !== "person") return null;
    if (segments.length === 3 && !PERSON_FOLDER_JPG_DIRECTORIES.some((folder) => normalizeNfc(folder).toLocaleLowerCase("ko-KR") === segments[1].toLocaleLowerCase("ko-KR"))) return null;
    return {
      relativePath: segments.join("/"),
      fileName,
      category: "photo",
      ownerName: person.name,
      ownerGroup: null,
    };
  }

  if (segments.length !== 3) return null;
  const mappingName = segments[0] as keyof typeof SCHOOL_MAPPINGS;
  const mapping = SCHOOL_MAPPINGS[mappingName];
  if (!mapping) return null;
  if (mapping.owner === "person") {
    const ownerName = parsePersonFolderName(segments[1], mappingName);
    if (!ownerName) return null;
    return { relativePath: segments.join("/"), fileName, category: mapping.category, ownerName, ownerGroup: null };
  }
  const ownerGroup = parseGroupFolderName(segments[1], mappingName);
  if (!ownerGroup) return null;
  return { relativePath: segments.join("/"), fileName, category: mapping.category, ownerName: null, ownerGroup };
}

export function scanLocalPersonSelectFiles(
  sources: LocalPersonSelectSource[],
  layout: PersonSelectImportLayout,
  topLevelFolders: string[] = [],
): LocalPersonSelectScan {
  const normalizedTop = [...new Set(topLevelFolders.map((name) => normalizeNfc(name)).filter(Boolean))];
  const groupFolders: string[] = [];
  const unnamedFolders: string[] = [];
  const skippedFolders: string[] = [];
  const personFolders: string[] = [];

  for (const folder of normalizedTop) {
    if (layout === "school") {
      if (!(folder in SCHOOL_MAPPINGS) && !folder.startsWith(".")) skippedFolders.push(folder);
      continue;
    }
    const kind = classifyPersonFolderName(folder);
    if (kind.kind === "group") groupFolders.push(folder);
    else if (kind.kind === "unnamed") unnamedFolders.push(folder);
    else if (kind.kind === "person") personFolders.push(kind.name);
  }

  const derived: LocalPersonSelectCandidate[] = sources.flatMap((source) => {
    const record = deriveLocalImportRecord(layout, source.relativePath);
    return record ? [{ ...source, ...record }] : [];
  });

  let files: LocalPersonSelectCandidate[] = derived;
  if (layout === "person-folders") {
    const byPerson = new Map<string, LocalPersonSelectCandidate[]>();
    for (const candidate of derived) {
      const list = byPerson.get(candidate.ownerName!) ?? [];
      list.push(candidate);
      byPerson.set(candidate.ownerName!, list);
    }
    files = [];
    for (const list of byPerson.values()) {
      const selectedDirectory = PERSON_FOLDER_JPG_DIRECTORIES.find((directory) => list.some((candidate) => candidate.relativePath.split("/")[1]?.toLocaleLowerCase("ko-KR") === directory.toLocaleLowerCase("ko-KR")));
      files.push(...list.filter((candidate) => selectedDirectory
        ? candidate.relativePath.split("/")[1]?.toLocaleLowerCase("ko-KR") === selectedDirectory.toLocaleLowerCase("ko-KR")
        : candidate.relativePath.split("/").length === 2));
    }
  }

  files.sort((a, b) => a.relativePath.localeCompare(b.relativePath, "ko"));
  const ownersWithPhotos = new Set(files.map((file) => file.ownerName).filter((name): name is string => Boolean(name)));
  const emptyFolders = layout === "person-folders" ? personFolders.filter((name) => !ownersWithPhotos.has(name)) : [];
  return { files, skippedFolders, groupFolders, unnamedFolders, emptyFolders };
}

type DirectoryWithEntries = FileSystemDirectoryHandle & {
  entries(): AsyncIterableIterator<[string, FileSystemHandle]>;
};

async function jpgFilesIn(directory: FileSystemDirectoryHandle, prefix: string) {
  const files: LocalPersonSelectSource[] = [];
  for await (const [name, handle] of (directory as DirectoryWithEntries).entries()) {
    if (handle.kind !== "file" || name.startsWith(".") || !JPG_FILE.test(name)) continue;
    files.push({ file: await (handle as FileSystemFileHandle).getFile(), relativePath: `${prefix}/${normalizeNfc(name)}` });
  }
  return files;
}

export async function collectLocalPersonSelectFolder(root: FileSystemDirectoryHandle, layout: PersonSelectImportLayout) {
  const sources: LocalPersonSelectSource[] = [];
  const topLevelFolders: string[] = [];
  for await (const [rootName, rootHandle] of (root as DirectoryWithEntries).entries()) {
    if (rootHandle.kind !== "directory") continue;
    const normalizedRootName = normalizeNfc(rootName);
    topLevelFolders.push(normalizedRootName);
    if (layout === "school") {
      if (!(normalizedRootName in SCHOOL_MAPPINGS)) continue;
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
    return JPG_FILE.test(file.name) ? [{ file, relativePath: segments.join("/") }] : [];
  });
  const topLevelFolders = [...new Set(sources.map((source) => source.relativePath.split("/")[0]).filter(Boolean))];
  return { folderName, scan: scanLocalPersonSelectFiles(sources, layout, topLevelFolders) };
}

async function canvasJpeg(bitmap: ImageBitmap, maxEdge: number, quality: number) {
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("사진 변환 화면을 만들지 못했습니다.");
  context.drawImage(bitmap, 0, 0, width, height);
  return new Promise<Blob>((resolve, reject) => canvas.toBlob(
    (blob) => blob ? resolve(blob) : reject(new Error("사진 미리보기를 만들지 못했습니다.")),
    "image/jpeg",
    quality,
  ));
}

export type JpegMetadata = { width: number; height: number; orientation: number };

const JPEG_SOF_MARKERS = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);

function exifOrientation(bytes: Uint8Array, start: number, end: number) {
  if (end - start < 14
    || bytes[start] !== 0x45 || bytes[start + 1] !== 0x78 || bytes[start + 2] !== 0x69 || bytes[start + 3] !== 0x66
    || bytes[start + 4] !== 0 || bytes[start + 5] !== 0) return null;
  const tiff = start + 6;
  const little = bytes[tiff] === 0x49 && bytes[tiff + 1] === 0x49;
  if (!little && !(bytes[tiff] === 0x4d && bytes[tiff + 1] === 0x4d)) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint16(tiff + 2, little) !== 42) return null;
  const ifd = tiff + view.getUint32(tiff + 4, little);
  if (ifd < tiff || ifd + 2 > end) return null;
  const count = view.getUint16(ifd, little);
  for (let index = 0; index < count; index += 1) {
    const entry = ifd + 2 + index * 12;
    if (entry + 12 > end) break;
    if (view.getUint16(entry, little) !== 0x0112) continue;
    const orientation = view.getUint16(entry + 8, little);
    return orientation >= 1 && orientation <= 8 ? orientation : null;
  }
  return null;
}

/** JPEG 전체를 디코딩하지 않고 헤더에서 원본 크기와 회전 정보만 읽는다. */
export function parseJpegMetadata(value: ArrayBuffer | Uint8Array): JpegMetadata | null {
  const bytes = value instanceof Uint8Array ? value : new Uint8Array(value);
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  let offset = 2;
  let orientation = 1;
  let width = 0;
  let height = 0;
  while (offset + 4 <= bytes.length) {
    if (bytes[offset] !== 0xff) { offset += 1; continue; }
    while (offset < bytes.length && bytes[offset] === 0xff) offset += 1;
    const marker = bytes[offset];
    offset += 1;
    if (marker === 0xd9 || marker === 0xda) break;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (offset + 2 > bytes.length) break;
    const length = (bytes[offset] << 8) | bytes[offset + 1];
    if (length < 2) return null;
    const start = offset + 2;
    const end = offset + length;
    if (end > bytes.length) break;
    if (marker === 0xe1) orientation = exifOrientation(bytes, start, end) ?? orientation;
    if (JPEG_SOF_MARKERS.has(marker) && start + 5 <= end) {
      height = (bytes[start + 1] << 8) | bytes[start + 2];
      width = (bytes[start + 3] << 8) | bytes[start + 4];
    }
    offset = end;
  }
  return width > 0 && height > 0 ? { width, height, orientation } : null;
}

function previewDimensions(metadata: JpegMetadata, maxEdge: number) {
  const rotated = metadata.orientation >= 5 && metadata.orientation <= 8;
  const sourceWidth = rotated ? metadata.height : metadata.width;
  const sourceHeight = rotated ? metadata.width : metadata.height;
  const scale = Math.min(1, maxEdge / Math.max(sourceWidth, sourceHeight));
  return {
    width: Math.max(1, Math.round(sourceWidth * scale)),
    height: Math.max(1, Math.round(sourceHeight * scale)),
    sourceWidth,
    sourceHeight,
  };
}

export async function createPersonSelectDerivatives(file: File) {
  const header = await file.slice(0, 1024 * 1024).arrayBuffer();
  const metadata = parseJpegMetadata(header);
  let bitmap: ImageBitmap;
  let sourceWidth: number | null = null;
  let sourceHeight: number | null = null;
  if (metadata) {
    const dimensions = previewDimensions(metadata, 1600);
    sourceWidth = dimensions.sourceWidth;
    sourceHeight = dimensions.sourceHeight;
    try {
      // 큰 원본 전체를 RGBA 비트맵으로 만든 뒤 줄이지 않고, 디코더 단계에서 바로 1600px로 축소한다.
      bitmap = await createImageBitmap(file, {
        imageOrientation: "from-image",
        resizeWidth: dimensions.width,
        resizeHeight: dimensions.height,
        resizeQuality: "high",
      });
    } catch {
      bitmap = await createImageBitmap(file, {
        resizeWidth: dimensions.width,
        resizeHeight: dimensions.height,
        resizeQuality: "high",
      });
    }
  } else {
    try {
      bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    } catch {
      bitmap = await createImageBitmap(file);
    }
  }
  try {
    const [thumb, preview] = await Promise.all([
      canvasJpeg(bitmap, 480, 0.72),
      canvasJpeg(bitmap, 1600, 0.8),
    ]);
    return { thumb, preview, sourceWidth: sourceWidth ?? bitmap.width, sourceHeight: sourceHeight ?? bitmap.height };
  } finally {
    bitmap.close();
  }
}
