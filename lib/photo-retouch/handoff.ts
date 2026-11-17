const HANDOFF_PREFIX = "olivia-photo-retouch-handoff:";
const RETURN_PREFIX = "olivia-photo-retouch-return:";
const HANDOFF_TTL_MS = 30 * 60 * 1_000;

export type PhotoRetouchHandoff = {
  sourcePath: string;
  selectedFileNames: string[];
  returnPath?: string;
};

export type PhotoRetouchReturn = {
  outputPath: string;
  returnPath: string;
};

type Stored<T> = { createdAt: number; value: T };

function key(prefix: string): string {
  const id = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}${id}`;
}

function write<T>(storage: Pick<Storage, "setItem">, prefix: string, value: T, now = Date.now()): string {
  const storageKey = key(prefix);
  storage.setItem(storageKey, JSON.stringify({ createdAt: now, value } satisfies Stored<T>));
  return storageKey.slice(prefix.length);
}

function read<T>(storage: Pick<Storage, "getItem" | "removeItem">, prefix: string, id: string, now = Date.now()): T | null {
  const storageKey = `${prefix}${id}`;
  const raw = storage.getItem(storageKey);
  storage.removeItem(storageKey);
  if (!raw) return null;
  try {
    const stored = JSON.parse(raw) as Stored<T>;
    if (!stored || typeof stored.createdAt !== "number" || now - stored.createdAt > HANDOFF_TTL_MS) return null;
    return stored.value ?? null;
  } catch {
    return null;
  }
}

function safePath(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const path = value.trim();
  if (!path || path.includes("\0") || path.split(/[\\/]/u).some((segment) => segment === "..")) return null;
  return path;
}

export function storePhotoRetouchHandoff(
  storage: Pick<Storage, "setItem">,
  value: PhotoRetouchHandoff,
  now = Date.now(),
): string {
  return write(storage, HANDOFF_PREFIX, value, now);
}

export function consumePhotoRetouchHandoff(
  storage: Pick<Storage, "getItem" | "removeItem">,
  id: string,
  now = Date.now(),
): PhotoRetouchHandoff | null {
  const value = read<PhotoRetouchHandoff>(storage, HANDOFF_PREFIX, id, now);
  const sourcePath = safePath(value?.sourcePath);
  if (!sourcePath || !Array.isArray(value?.selectedFileNames)) return null;
  const selectedFileNames = value.selectedFileNames
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => entry.trim().replace(/\\/gu, "/").normalize("NFC"))
    .filter(Boolean)
    .slice(0, 5_000);
  const returnPath = value.returnPath ? safePath(value.returnPath) ?? undefined : undefined;
  return { sourcePath, selectedFileNames: [...new Set(selectedFileNames)], ...(returnPath ? { returnPath } : {}) };
}

export function storePhotoRetouchReturn(
  storage: Pick<Storage, "setItem">,
  value: PhotoRetouchReturn,
  now = Date.now(),
): string {
  return write(storage, RETURN_PREFIX, value, now);
}

export function consumePhotoRetouchReturn(
  storage: Pick<Storage, "getItem" | "removeItem">,
  id: string,
  now = Date.now(),
): PhotoRetouchReturn | null {
  const value = read<PhotoRetouchReturn>(storage, RETURN_PREFIX, id, now);
  const outputPath = safePath(value?.outputPath);
  const returnPath = safePath(value?.returnPath);
  return outputPath && returnPath ? { outputPath, returnPath } : null;
}
