import { normalizeRemoteNasRelativePath, toRemoteNasDisplayPath } from "@/lib/remote-nas/path";
import { REMOTE_NAS_ROOT_NAME, type RemoteNasSelection } from "@/lib/remote-nas/types";

export function remoteNasSelectionFromPrefill(
  rawFolder: string | null | undefined,
): RemoteNasSelection | null {
  if (!rawFolder) return null;
  try {
    const path = normalizeRemoteNasRelativePath(rawFolder);
    if (!path) return null;
    return {
      path,
      displayPath: toRemoteNasDisplayPath(path),
      rootName: REMOTE_NAS_ROOT_NAME,
    };
  } catch {
    return null;
  }
}
