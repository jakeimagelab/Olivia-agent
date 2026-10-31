export type BridgeFolderTrailItem = {
  name: string;
  handle: FileSystemDirectoryHandle;
};

export type BridgeRawFolderCandidate = BridgeFolderTrailItem & {
  /** 현재 폴더는 0, 바로 위는 1, 두 단계 위는 2. */
  distance: 0 | 1 | 2;
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

export function bridgeRawMatchFolderCandidates(
  trail: readonly BridgeFolderTrailItem[],
): BridgeRawFolderCandidate[] {
  const output: BridgeRawFolderCandidate[] = [];
  for (let distance = 0; distance <= 2; distance += 1) {
    const item = trail.at(-(distance + 1));
    if (!item) break;
    output.push({ ...item, distance: distance as 0 | 1 | 2 });
  }
  return output;
}

type ResolvableDirectoryHandle = FileSystemDirectoryHandle & {
  resolve?: (possibleDescendant: FileSystemHandle) => Promise<string[] | null>;
};

/**
 * 네이티브 폴더 선택기로 받은 상위 폴더 권한에서 현재 사진 폴더까지의 trail을 복원한다.
 * 브라우저는 자식 handle만으로 부모를 알 수 없으므로, RAW 매칭 전에 사용자가 상위 폴더를
 * 한 번 허용했을 때만 이 방향으로 경로를 확인한다.
 */
export async function resolveBridgeFolderTrail(
  root: FileSystemDirectoryHandle,
  current: FileSystemDirectoryHandle,
): Promise<BridgeFolderTrailItem[] | null> {
  const resolve = (root as ResolvableDirectoryHandle).resolve;
  if (typeof resolve !== "function") return null;
  const segments = await resolve.call(root, current);
  if (!segments) return null;

  const trail: BridgeFolderTrailItem[] = [{ name: root.name, handle: root }];
  let directory = root;
  for (const segment of segments) {
    directory = await directory.getDirectoryHandle(segment);
    trail.push({ name: directory.name, handle: directory });
  }
  return trail;
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
