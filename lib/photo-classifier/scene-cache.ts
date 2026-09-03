import type { LocalVisualFeatures } from "./hybrid-types";

const DB_NAME = "olivia-photo-classification";
// AI 사진 분류 2.0 — 폴더 패턴 프로필 캐시용 store 추가로 버전 2로 올림(onupgradeneeded가
// 기존 features/jobs store는 그대로 두고 patterns store만 새로 만든다 — 기존 캐시 유지).
const DB_VERSION = 2;
const FEATURE_STORE = "features";
const JOB_STORE = "jobs";
const PATTERN_STORE = "patterns";

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(FEATURE_STORE)) database.createObjectStore(FEATURE_STORE);
      if (!database.objectStoreNames.contains(JOB_STORE)) database.createObjectStore(JOB_STORE);
      if (!database.objectStoreNames.contains(PATTERN_STORE)) database.createObjectStore(PATTERN_STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function transact<T>(storeName: string, mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>) {
  const database = await openDatabase();
  return new Promise<T>((resolve, reject) => {
    const transaction = database.transaction(storeName, mode);
    const request = action(transaction.objectStore(storeName));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    transaction.oncomplete = () => database.close();
  });
}

export function featureCacheKey(rootName: string, file: File) {
  return `${rootName}:${file.name}:${file.size}:${file.lastModified}`;
}

export async function getCachedFeature(key: string): Promise<LocalVisualFeatures | null> {
  try { return (await transact<LocalVisualFeatures | undefined>(FEATURE_STORE, "readonly", (store) => store.get(key))) ?? null; }
  catch { return null; }
}

export async function setCachedFeature(key: string, features: LocalVisualFeatures) {
  try { await transact(FEATURE_STORE, "readwrite", (store) => store.put(features, key)); } catch {}
}

export async function getClassificationCheckpoint<T>(jobId: string): Promise<T | null> {
  try { return (await transact<T | undefined>(JOB_STORE, "readonly", (store) => store.get(jobId))) ?? null; }
  catch { return null; }
}

export async function setClassificationCheckpoint<T>(jobId: string, checkpoint: T) {
  try { await transact(JOB_STORE, "readwrite", (store) => store.put(checkpoint, jobId)); } catch {}
}

export async function clearClassificationCheckpoint(jobId: string) {
  try { await transact(JOB_STORE, "readwrite", (store) => store.delete(jobId)); } catch {}
}
