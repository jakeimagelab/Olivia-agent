import type { RemoteNasSelection } from "@/lib/remote-nas/types";

const STORAGE_PREFIX = "olivia-raw-match-nas-folder:v1:";

type StoredNasRawMatchPreference = {
  version: 1;
  selection: RemoteNasSelection;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function normalizeNasRawMatchFolderIdentity(value: string): string {
  return value
    .normalize("NFC")
    .split(/\s*[\\/]\s*/u)
    .map((part) => part.trim())
    .filter(Boolean)
    .join("/");
}

export function nasRawMatchPreferenceStorageKey(folderIdentity: string): string | null {
  const normalized = normalizeNasRawMatchFolderIdentity(folderIdentity);
  return normalized ? `${STORAGE_PREFIX}${encodeURIComponent(normalized)}` : null;
}

export function parseNasRawMatchPreference(value: unknown): RemoteNasSelection | null {
  if (!isRecord(value) || value.version !== 1 || !isRecord(value.selection)) return null;
  const selection = value.selection;
  if (
    typeof selection.path !== "string"
    || typeof selection.displayPath !== "string"
    || typeof selection.rootName !== "string"
    || !selection.rootName.trim()
  ) return null;
  return {
    path: selection.path,
    displayPath: selection.displayPath.normalize("NFC"),
    rootName: selection.rootName.normalize("NFC"),
  };
}

export function readNasRawMatchPreference(
  storage: Pick<Storage, "getItem">,
  folderIdentity: string,
): RemoteNasSelection | null {
  const key = nasRawMatchPreferenceStorageKey(folderIdentity);
  if (!key) return null;
  try {
    const raw = storage.getItem(key);
    return raw ? parseNasRawMatchPreference(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

export function writeNasRawMatchPreference(
  storage: Pick<Storage, "setItem">,
  folderIdentity: string,
  selection: RemoteNasSelection,
): boolean {
  const key = nasRawMatchPreferenceStorageKey(folderIdentity);
  if (!key) return false;
  const payload: StoredNasRawMatchPreference = {
    version: 1,
    selection: {
      path: selection.path,
      displayPath: selection.displayPath.normalize("NFC"),
      rootName: selection.rootName.normalize("NFC"),
    },
  };
  try {
    storage.setItem(key, JSON.stringify(payload));
    return true;
  } catch {
    return false;
  }
}
