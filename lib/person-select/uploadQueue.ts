export type PersonSelectUploadJobStatus = "queued" | "uploading" | "paused" | "completed" | "partial_failed" | "failed" | "canceled";
export type PersonSelectUploadFileStatus = "pending" | "uploading" | "completed" | "failed" | "canceled";

export type PersonSelectUploadJob = {
  id: string;
  event_id: string;
  project_title: string;
  source_name: string;
  layout: "school" | "person-folders" | "project";
  status: PersonSelectUploadJobStatus;
  total_count: number;
  success_count: number;
  failed_count: number;
  pending_count: number;
  active_count: number;
  needs_file_reselection: boolean;
  error?: string | null;
  started_at?: string | null;
  completed_at?: string | null;
  created_at?: string;
  updated_at?: string;
};

export type UploadManifestFile = {
  relativePath: string;
  fileName: string;
  size: number;
  lastModified: number;
  idempotencyKey: string;
};

/** 경로·크기·수정시각을 함께 써서 같은 basename의 다른 폴더 파일을 합치지 않는다. */
export function uploadFileIdempotencyKey(file: Pick<UploadManifestFile, "relativePath" | "size" | "lastModified">) {
  const value = `${file.relativePath.normalize("NFC")}\u0000${file.size}\u0000${file.lastModified}`;
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `psu_${(hash >>> 0).toString(16).padStart(8, "0")}_${file.size}_${file.lastModified}`;
}

export function uploadJobStatusFromCounts(input: {
  total: number;
  completed: number;
  failed: number;
  pending: number;
  active: number;
  canceled?: boolean;
  paused?: boolean;
}): PersonSelectUploadJobStatus {
  if (input.canceled) return "canceled";
  if (input.paused && (input.pending > 0 || input.failed > 0)) return "paused";
  if (input.completed === input.total && input.total > 0) return "completed";
  if (input.pending === 0 && input.active === 0 && input.failed > 0) return input.completed > 0 ? "partial_failed" : "failed";
  return input.active > 0 ? "uploading" : "queued";
}

export function pendingUploadPaths<T extends { relativePath: string }>(files: T[], completedPaths: Iterable<string>) {
  const completed = new Set(completedPaths);
  return files.filter((file) => !completed.has(file.relativePath));
}

export function indexUploadFilesByPath<T extends { relativePath: string }>(files: readonly T[]) {
  const filesByPath = new Map<string, T>();
  const sortOrderByPath = new Map<string, number>();
  files.forEach((file, index) => {
    filesByPath.set(file.relativePath, file);
    sortOrderByPath.set(file.relativePath, index);
  });
  return { filesByPath, sortOrderByPath };
}
