import type {
  LocalPersonSelectCandidate,
  LocalPersonSelectScan,
  PersonSelectImportLayout,
} from "./localImportRecords";
import {
  indexUploadFilesByPath,
  uploadFileIdempotencyKey,
  type UploadManifestFile,
} from "./uploadQueue";

export type PersonSelectUploadJobFile = {
  relative_path: string;
  file_size: number;
  last_modified: number;
  status: string;
};

export type PersonSelectUploadRuntime = {
  eventId: string;
  layout: PersonSelectImportLayout;
  files: Map<string, LocalPersonSelectCandidate>;
  sortOrderByPath: Map<string, number>;
  queue: string[];
  attempts: Map<string, number>;
  paused: boolean;
  canceled: boolean;
  pumping: boolean;
  controllers: Set<AbortController>;
};

export function personSelectUploadManifest(scan: LocalPersonSelectScan): UploadManifestFile[] {
  return scan.files.map((candidate) => {
    const base = {
      relativePath: candidate.relativePath,
      fileName: candidate.fileName,
      size: candidate.file.size,
      lastModified: candidate.file.lastModified,
    };
    return { ...base, idempotencyKey: uploadFileIdempotencyKey(base) };
  });
}

export function createPersonSelectUploadRuntime({
  eventId,
  layout,
  files,
  queue,
}: {
  eventId: string;
  layout: PersonSelectImportLayout;
  files: readonly LocalPersonSelectCandidate[];
  queue: readonly string[];
}): PersonSelectUploadRuntime {
  const indexed = indexUploadFilesByPath(files);
  return {
    eventId,
    layout,
    files: indexed.filesByPath,
    sortOrderByPath: indexed.sortOrderByPath,
    queue: [...queue],
    attempts: new Map(),
    paused: false,
    canceled: false,
    pumping: false,
    controllers: new Set(),
  };
}

export function resumablePersonSelectUploadPaths(
  rows: readonly PersonSelectUploadJobFile[],
  files: ReadonlyMap<string, LocalPersonSelectCandidate>,
) {
  return rows.flatMap((row) => {
    if (row.status !== "pending" && row.status !== "failed" && row.status !== "uploading") return [];
    const selected = files.get(row.relative_path);
    if (!selected
      || selected.file.size !== Number(row.file_size)
      || selected.file.lastModified !== Number(row.last_modified)) return [];
    return [row.relative_path];
  });
}
