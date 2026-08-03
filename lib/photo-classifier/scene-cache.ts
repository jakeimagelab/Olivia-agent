import type { LocalVisualFeatures } from "./hybrid-types";

const DB_NAME = "olivia-photo-classification";
const DB_VERSION = 1;
const FEATURE_STORE = "features";
const JOB_STORE = "jobs";

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(FEATURE_STORE)) database.createObjectStore(FEATURE_STORE);
      if (!database.objectStoreNames.contains(JOB_STORE)) database.createObjectStore(JOB_STORE);
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
