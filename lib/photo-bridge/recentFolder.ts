export type BridgeFolderTrailItem = {
  name: string;
  handle: FileSystemDirectoryHandle;
};

export type BridgeFolderPermission = "granted" | "prompt" | "denied";

const DATABASE_NAME = "olivia-bridge";
const DATABASE_VERSION = 1;
const STORE_NAME = "workspace-state";
const LAST_FOLDER_KEY = "last-folder-trail";

type PermissionHandle = FileSystemDirectoryHandle & {
  queryPermission?: (options: { mode: "readwrite" }) => Promise<BridgeFolderPermission>;
  requestPermission?: (options: { mode: "readwrite" }) => Promise<BridgeFolderPermission>;
};

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) request.result.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("최근 Bridge 폴더 저장소를 열지 못했습니다."));
  });
}

async function transact<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const database = await openDatabase();
  try {
    return await new Promise<T>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, mode);
      const request = action(transaction.objectStore(STORE_NAME));
      let result: T;
      request.onsuccess = () => { result = request.result; };
      request.onerror = () => reject(request.error ?? new Error("최근 Bridge 폴더를 처리하지 못했습니다."));
      transaction.oncomplete = () => resolve(result);
      transaction.onerror = () => reject(transaction.error ?? new Error("최근 Bridge 폴더를 처리하지 못했습니다."));
      transaction.onabort = () => reject(transaction.error ?? new Error("최근 Bridge 폴더 처리가 취소되었습니다."));
    });
  } finally {
    database.close();
  }
}

function isFolderTrail(value: unknown): value is BridgeFolderTrailItem[] {
  if (!Array.isArray(value) || !value.length) return false;
  return value.every((item) => {
    if (!item || typeof item !== "object") return false;
    const record = item as Record<string, unknown>;
    const handle = record.handle as { kind?: unknown; name?: unknown } | undefined;
    return typeof record.name === "string" && handle?.kind === "directory" && typeof handle.name === "string";
  });
}

export function bridgeRawMatchDefaultFolder(
  trail: readonly BridgeFolderTrailItem[],
): FileSystemDirectoryHandle | null {
  return trail.length > 1 ? trail.at(-2)?.handle ?? null : null;
}

export async function saveBridgeFolderTrail(trail: readonly BridgeFolderTrailItem[]): Promise<void> {
  if (!trail.length) return;
  await transact("readwrite", (store) => store.put(trail.map((item) => ({ name: item.name, handle: item.handle })), LAST_FOLDER_KEY));
}

export async function readBridgeFolderTrail(): Promise<BridgeFolderTrailItem[] | null> {
  const value = await transact<unknown>("readonly", (store) => store.get(LAST_FOLDER_KEY));
  return isFolderTrail(value) ? value : null;
}

export async function clearBridgeFolderTrail(): Promise<void> {
  await transact("readwrite", (store) => store.delete(LAST_FOLDER_KEY));
}

export async function queryBridgeFolderTrailPermission(trail: readonly BridgeFolderTrailItem[]): Promise<BridgeFolderPermission> {
  if (!trail.length) return "denied";
  let result: BridgeFolderPermission = "granted";
  for (const item of trail) {
    const handle = item.handle as PermissionHandle;
    if (typeof handle.queryPermission !== "function") return "prompt";
    const permission = await handle.queryPermission({ mode: "readwrite" });
    if (permission === "denied") return "denied";
    if (permission === "prompt") result = "prompt";
  }
  return result;
}

export async function requestBridgeFolderTrailPermission(trail: readonly BridgeFolderTrailItem[]): Promise<BridgeFolderPermission> {
  const root = trail[0]?.handle as PermissionHandle | undefined;
  if (!root) return "denied";
  if (typeof root.requestPermission !== "function") return "granted";
  const permission = await root.requestPermission({ mode: "readwrite" });
  if (permission !== "granted") return permission;
  return queryBridgeFolderTrailPermission(trail);
}
