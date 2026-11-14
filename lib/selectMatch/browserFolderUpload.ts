type LegacyFileEntry = {
  isFile: true;
  isDirectory: false;
  file: (success: (file: File) => void, failure?: (error: DOMException) => void) => void;
};

type LegacyDirectoryReader = {
  readEntries: (
    success: (entries: LegacyFileSystemEntry[]) => void,
    failure?: (error: DOMException) => void,
  ) => void;
};

type LegacyDirectoryEntry = {
  isFile: false;
  isDirectory: true;
  createReader: () => LegacyDirectoryReader;
};

type LegacyFileSystemEntry = LegacyFileEntry | LegacyDirectoryEntry;

type DataTransferItemWithEntry = {
  webkitGetAsEntry?: () => LegacyFileSystemEntry | null;
};

function readEntryFile(entry: LegacyFileEntry): Promise<File> {
  return new Promise((resolve, reject) => entry.file(resolve, reject));
}

function readDirectoryBatch(reader: LegacyDirectoryReader): Promise<LegacyFileSystemEntry[]> {
  return new Promise((resolve, reject) => reader.readEntries(resolve, reject));
}

async function readAllDirectoryEntries(entry: LegacyDirectoryEntry): Promise<LegacyFileSystemEntry[]> {
  const reader = entry.createReader();
  const entries: LegacyFileSystemEntry[] = [];
  while (true) {
    const batch = await readDirectoryBatch(reader);
    if (!batch.length) return entries;
    entries.push(...batch);
  }
}

export async function collectLegacyEntryFiles(entry: LegacyFileSystemEntry): Promise<File[]> {
  if (entry.isFile) return [await readEntryFile(entry)];
  const children = await readAllDirectoryEntries(entry);
  const nested = await Promise.all(children.map(collectLegacyEntryFiles));
  return nested.flat();
}

export async function collectDroppedFolderFiles(dataTransfer: DataTransfer): Promise<File[]> {
  const entries = Array.from(dataTransfer.items)
    .map((item) => (item as unknown as DataTransferItemWithEntry).webkitGetAsEntry?.() ?? null)
    .filter((entry): entry is LegacyFileSystemEntry => Boolean(entry));
  const files = entries.length
    ? (await Promise.all(entries.map(collectLegacyEntryFiles))).flat()
    : Array.from(dataTransfer.files);
  return files.sort((left, right) => {
    const leftPath = left.webkitRelativePath || left.name;
    const rightPath = right.webkitRelativePath || right.name;
    return leftPath.localeCompare(rightPath, "ko");
  });
}
