import { normalizeRemoteNasRelativePath } from "@/lib/remote-nas/path";
import { finiteNumber, type RemoteJobAction } from "./requestValidation";

type RemoteJobPayload = Record<string, unknown>;

function normalizeListFolder(requested: RemoteJobPayload): RemoteJobPayload {
  const remotePath = requested.remote_path;
  const root = requested.root;
  const foldersOnly = requested.folders_only;

  if (remotePath !== undefined && remotePath !== null && typeof remotePath !== "string") {
    throw new Error("LIST_FOLDER의 remote_path는 문자열이어야 합니다.");
  }
  if (foldersOnly !== undefined && typeof foldersOnly !== "boolean") {
    throw new Error("folders_only는 boolean이어야 합니다.");
  }
  if (root !== undefined && typeof root !== "boolean") {
    throw new Error("LIST_FOLDER의 root는 boolean이어야 합니다.");
  }

  // Worker가 반환한 Unicode form은 그대로 유지하고 절대경로/traversal만 차단한다.
  const normalizedPath = normalizeRemoteNasRelativePath(remotePath ?? "");
  if (root === true && normalizedPath) {
    throw new Error("LIST_FOLDER의 root와 remote_path를 동시에 지정할 수 없습니다.");
  }
  return {
    ...(root === true || !normalizedPath ? { root: true } : { remote_path: normalizedPath }),
    ...(foldersOnly === true ? { folders_only: true } : {}),
  };
}

function normalizePhotoSourceFolder(
  action: "PHOTO_SORT" | "PHOTO_CHECK_WORK_FOLDER",
  requested: RemoteJobPayload,
): RemoteJobPayload {
  const sourceFolder = requested.source_folder;
  if (typeof sourceFolder !== "string") {
    throw new Error(`${action}에는 source_folder 상대경로가 필요합니다.`);
  }
  const safeSourceFolder = normalizeRemoteNasRelativePath(sourceFolder);
  if (!safeSourceFolder) throw new Error("NAS Root가 아닌 촬영 폴더를 선택해주세요.");
  return action === "PHOTO_SORT"
    ? { ...requested, source_folder: safeSourceFolder }
    : { source_folder: safeSourceFolder };
}

function normalizePhotoThumbs(requested: RemoteJobPayload): RemoteJobPayload {
  const remotePath = normalizeRemoteNasRelativePath(
    typeof requested.remote_path === "string" ? requested.remote_path : "",
  );
  if (!remotePath) throw new Error("NAS 촬영 폴더를 선택해 주세요.");
  return {
    remote_path: remotePath,
    max_count: finiteNumber(requested.max_count, "max_count", 1, 400, true) ?? 400,
    offset: finiteNumber(requested.offset, "offset", 0, 100_000, true) ?? 0,
  };
}

function normalizePhotoXmpRatings(requested: RemoteJobPayload): RemoteJobPayload {
  const remotePath = normalizeRemoteNasRelativePath(
    typeof requested.remote_path === "string" ? requested.remote_path : "",
  );
  if (!remotePath) throw new Error("NAS 촬영 폴더를 선택해 주세요.");
  return { remote_path: remotePath };
}

/** Returns null for actions outside folder browsing and lightweight photo inspection. */
export function normalizePhotoBrowseRequestPayload(
  action: RemoteJobAction,
  requested: RemoteJobPayload,
): RemoteJobPayload | null {
  switch (action) {
    case "LIST_FOLDER":
      return normalizeListFolder(requested);
    case "PHOTO_SORT":
    case "PHOTO_CHECK_WORK_FOLDER":
      return normalizePhotoSourceFolder(action, requested);
    case "PHOTO_THUMBS":
      return normalizePhotoThumbs(requested);
    case "PHOTO_XMP_RATINGS":
      return normalizePhotoXmpRatings(requested);
    default:
      return null;
  }
}
