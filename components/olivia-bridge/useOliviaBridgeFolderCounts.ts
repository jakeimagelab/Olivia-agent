"use client";

import { useEffect, useState } from "react";

import { bridgeFileKind } from "@/lib/photo-bridge/bridgeFiles";
import { isDeliveredRoundFolder } from "@/lib/photo-bridge/rawMatchDelivery";

const FOLDER_COUNT_CONCURRENCY = 3;

export async function countOliviaBridgeFolderImages(
  directory: FileSystemDirectoryHandle,
  depth = 0,
): Promise<number> {
  if (depth > 5) return 0;
  let count = 0;
  const iterable = directory as FileSystemDirectoryHandle & {
    entries(): AsyncIterableIterator<[string, FileSystemHandle]>;
  };
  try {
    for await (const [name, handle] of iterable.entries()) {
      if (name.startsWith(".")) continue;
      if (handle.kind === "directory") {
        if (isDeliveredRoundFolder(name)) continue;
        count += await countOliviaBridgeFolderImages(handle as FileSystemDirectoryHandle, depth + 1);
        continue;
      }
      const kind = bridgeFileKind(name);
      if (kind === "jpg" || kind === "raw") count += 1;
    }
  } catch {
    return count;
  }
  return count;
}

export function useOliviaBridgeFolderCounts(
  activeFolder: FileSystemDirectoryHandle | null,
  folders: readonly FileSystemDirectoryHandle[],
) {
  const [counts, setCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    if (!activeFolder || !folders.length) {
      setCounts({});
      return;
    }

    let disposed = false;
    let cursor = 0;
    setCounts({});

    const scanNext = async () => {
      while (!disposed) {
        const index = cursor;
        cursor += 1;
        const folder = folders[index];
        if (!folder) return;
        const count = await countOliviaBridgeFolderImages(folder);
        if (disposed) return;
        setCounts((current) => ({
          ...current,
          [folder.name.normalize("NFC")]: count,
        }));
      }
    };

    const workerCount = Math.min(FOLDER_COUNT_CONCURRENCY, folders.length);
    for (let index = 0; index < workerCount; index += 1) void scanNext();

    return () => {
      disposed = true;
    };
  }, [activeFolder, folders]);

  return counts;
}
