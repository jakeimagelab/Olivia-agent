import { normalizeRemoteNasRelativePath } from "@/lib/remote-nas/path";
import {
  isRemoteJobUuid,
  safePersonSelectSourcePath,
  type RemoteJobAction,
} from "./requestValidation";

type RemoteJobPayload = Record<string, unknown>;

function normalizeImportPayload(requested: RemoteJobPayload): RemoteJobPayload {
  if (!isRemoteJobUuid(requested.event_id)) throw new Error("올바른 event_id가 필요합니다.");
  const sourceRelativePath = safePersonSelectSourcePath(requested.source_relative_path);

  if (requested.layout === "person-folders" || requested.layout === "project") {
    return {
      event_id: requested.event_id,
      source_relative_path: sourceRelativePath,
      layout: requested.layout,
    };
  }

  const mappings = requested.mappings;
  if (!Array.isArray(mappings) || mappings.length === 0 || mappings.some((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return true;
    const value = entry as Record<string, unknown>;
    return typeof value.folder !== "string"
      || typeof value.category !== "string"
      || !["person", "group"].includes(String(value.owner));
  })) {
    throw new Error("가져오기 항목 매핑이 올바르지 않습니다.");
  }

  return {
    event_id: requested.event_id,
    source_relative_path: sourceRelativePath,
    mappings,
  };
}

function normalizeRawMatchPayload(requested: RemoteJobPayload): RemoteJobPayload {
  if (!isRemoteJobUuid(requested.event_id)) throw new Error("올바른 event_id가 필요합니다.");

  const source = requested.source === undefined ? "submitted" : requested.source;
  const mode = requested.mode === undefined ? "copy" : requested.mode;
  if (source !== "submitted" && source !== "current") {
    throw new Error("워커 코드가 오래되었습니다. 최신화 후 다시 실행하세요.");
  }
  if (mode !== "copy" && mode !== "mark") {
    throw new Error("워커 코드가 오래되었습니다. 최신화 후 다시 실행하세요.");
  }

  const reviewerIds = requested.reviewerIds;
  if (
    reviewerIds !== undefined
    && (
      !Array.isArray(reviewerIds)
      || reviewerIds.length > 100
      || reviewerIds.some((reviewerId) => !isRemoteJobUuid(reviewerId))
    )
  ) {
    throw new Error("RAW 매칭 검토자 범위가 올바르지 않습니다.");
  }

  const clearMark = requested.clear_mark === true;
  if (clearMark && mode !== "mark") {
    throw new Error("로우 셀렉 지우기는 mark 모드에서만 실행할 수 있습니다.");
  }

  const labelNames = requested.labelNames;
  if (
    labelNames !== undefined
    && (
      !labelNames
      || typeof labelNames !== "object"
      || Array.isArray(labelNames)
      || ["6", "7", "8", "9"].some((key) => typeof (labelNames as RemoteJobPayload)[key] !== "string")
    )
  ) {
    throw new Error("로우 셀렉 컬러 라벨 설정이 올바르지 않습니다.");
  }

  return {
    event_id: requested.event_id,
    mode,
    source,
    ...(clearMark ? { clear_mark: true } : {}),
    ...(labelNames ? { labelNames } : {}),
    ...(Array.isArray(reviewerIds) && reviewerIds.length
      ? { reviewerIds: [...new Set(reviewerIds)] }
      : {}),
  };
}

function normalizeFolderPayload(requested: RemoteJobPayload): RemoteJobPayload {
  const remotePath = requested.remote_path;
  const root = requested.root;
  const foldersOnly = requested.folders_only;
  if (remotePath !== undefined && remotePath !== null && typeof remotePath !== "string") {
    throw new Error("폴더 경로가 올바르지 않습니다.");
  }
  if (root !== undefined && typeof root !== "boolean") throw new Error("root는 boolean이어야 합니다.");
  if (foldersOnly !== undefined && typeof foldersOnly !== "boolean") {
    throw new Error("folders_only는 boolean이어야 합니다.");
  }
  const safePath = remotePath ? normalizeRemoteNasRelativePath(remotePath) : "";
  if (root === true && safePath) throw new Error("root와 remote_path를 동시에 지정할 수 없습니다.");
  return {
    ...(root === true || !safePath ? { root: true } : { remote_path: safePath }),
    ...(foldersOnly === true ? { folders_only: true } : {}),
  };
}

/** Returns null for actions that are not part of the person-select worker pipeline. */
export function normalizePersonSelectRequestPayload(
  action: RemoteJobAction,
  requested: RemoteJobPayload,
): RemoteJobPayload | null {
  switch (action) {
    case "PERSON_SELECT_IMPORT":
      return normalizeImportPayload(requested);
    case "PERSON_SELECT_DELIVERY_IMPORT":
      if (!isRemoteJobUuid(requested.event_id)) throw new Error("올바른 event_id가 필요합니다.");
      return {
        event_id: requested.event_id,
        source_relative_path: safePersonSelectSourcePath(requested.source_relative_path),
      };
    case "PERSON_SELECT_DELIVERY_PURGE":
      return {};
    case "PERSON_SELECT_RAW_MATCH":
      return normalizeRawMatchPayload(requested);
    case "PERSON_SELECT_LIST_FOLDER":
      return normalizeFolderPayload(requested);
    default:
      return null;
  }
}
