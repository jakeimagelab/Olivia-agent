import type { SupabaseClient } from "@supabase/supabase-js";
import { validatePhotoProjectRelativePath } from "@/lib/photo-storage/server";
import { enqueuePhotoOperationJob, ensurePhotoOperationProject } from "./remoteJobService";
import { normalizeSelectionReportFileName } from "./selectionReportFileNames";

const MAX_SELECTED_FILES = 10_000;
const JPG_EXTENSIONS = new Set(["jpg", "jpeg"]);

export function parseRemoteSelectedFileNames(value: unknown): string[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_SELECTED_FILES) {
    throw new Error(`선택 JPG 파일명은 1~${MAX_SELECTED_FILES.toLocaleString("ko-KR")}개여야 합니다.`);
  }

  const unique = new Map<string, string>();
  for (const item of value) {
    if (typeof item !== "string") throw new Error("선택 JPG 파일명은 문자열이어야 합니다.");
    const fileName = normalizeSelectionReportFileName(item);
    if (!fileName) throw new Error(`JPG/JPEG basename만 RAW 매칭에 사용할 수 있습니다: ${item}`);
    const extension = fileName.split(".").at(-1)?.toLocaleLowerCase("en-US");
    if (!extension || !JPG_EXTENSIONS.has(extension)) throw new Error(`JPG/JPEG 파일만 RAW 매칭에 사용할 수 있습니다: ${fileName}`);
    const key = fileName.toLocaleLowerCase("en-US");
    if (!unique.has(key)) unique.set(key, fileName);
  }
  return [...unique.values()];
}

export async function startRemoteRawMatchJob(db: SupabaseClient, input: {
  projectRelativePath: unknown;
  selectedFileNames: unknown;
  confirmRestart: boolean;
}) {
  const projectRelativePath = validatePhotoProjectRelativePath(input.projectRelativePath);
  const selectedFileNames = parseRemoteSelectedFileNames(input.selectedFileNames);
  const displayName = projectRelativePath.split("/").at(-1) || projectRelativePath;
  const project = await ensurePhotoOperationProject(db, {
    sourceRelativePath: projectRelativePath,
    displayName,
    rawCount: 0,
    jpgCount: 0,
    jpgBytes: 0,
  });
  const job = await enqueuePhotoOperationJob(db, {
    action: "PHOTO_RAW_MATCH",
    projectId: project.id,
    confirmRestart: input.confirmRestart,
    confirmCompletedRestart: true,
    payload: {
      project_id: project.id,
      project_relative_path: projectRelativePath,
      selected_file_names: selectedFileNames,
      selection_source: "remote_direct_selection",
    },
  });
  return { project, job, projectRelativePath, selectedFileNames };
}
