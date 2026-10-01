"use client";

export type LocalCapture = {
  key: string;
  recordingId: string;
  sequence: number | null;
  blob: Blob;
  /** Capture timeline metadata is stored with the Blob so a retry never invents a range. */
  startMilliseconds: number | null;
  endMilliseconds: number | null;
  mimeType: string;
  createdAt: string;
};

const DATABASE = "olivia-voice-captures";
const STORE = "captures";
const EVENT_STORE = "events";

export type LocalRecordingEvent = {
  key: string;
  recordingId: string;
  eventId: string;
  eventType: "question_started" | "highlight" | "follow_up" | "field_note";
  questionId: string;
  atSeconds: number;
  clientSequence: number;
  audioEpochId: string;
  payload: Record<string, unknown>;
  createdAt: string;
};

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 2);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE, { keyPath: "key" });
      if (!request.result.objectStoreNames.contains(EVENT_STORE)) request.result.createObjectStore(EVENT_STORE, { keyPath: "key" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("기기 저장소를 열지 못했습니다."));
  });
}

async function transaction<T>(storeName: typeof STORE | typeof EVENT_STORE, mode: IDBTransactionMode, work: (store: IDBObjectStore) => IDBRequest<T>) {
  const database = await openDatabase();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = database.transaction(storeName, mode);
      const request = work(tx.objectStore(STORE));
      let result: T;
      request.onsuccess = () => { result = request.result; };
      request.onerror = () => reject(request.error || new Error("기기 저장소 작업에 실패했습니다."));
      tx.oncomplete = () => resolve(result);
      tx.onerror = () => reject(tx.error || new Error("기기 저장소 작업에 실패했습니다."));
      tx.onabort = () => reject(tx.error || new Error("기기 저장소 작업이 취소되었습니다."));
    });
  } finally {
    database.close();
  }
}

export function localCaptureKey(recordingId: string, sequence: number | null) {
  return `${recordingId}:${sequence === null ? "general" : sequence}`;
}

export async function persistLocalCapture(input: Omit<LocalCapture, "key" | "createdAt">) {
  const value: LocalCapture = { ...input, key: localCaptureKey(input.recordingId, input.sequence), createdAt: new Date().toISOString() };
  await transaction(STORE, "readwrite", (store) => store.put(value));
  return value;
}

export async function getLocalCapture(recordingId: string, sequence: number | null) {
  return transaction<LocalCapture | undefined>(STORE, "readonly", (store) => store.get(localCaptureKey(recordingId, sequence)));
}

export async function listLocalCaptures(recordingId: string) {
  const database = await openDatabase();
  try {
    return await new Promise<LocalCapture[]>((resolve, reject) => {
      const request = database.transaction(STORE, "readonly").objectStore(STORE).getAll();
      request.onsuccess = () => resolve((request.result as LocalCapture[]).filter((item) => item.recordingId === recordingId));
      request.onerror = () => reject(request.error || new Error("기기 저장소를 읽지 못했습니다."));
    });
  } finally {
    database.close();
  }
}

export async function removeLocalCapture(recordingId: string, sequence: number | null) {
  await transaction(STORE, "readwrite", (store) => store.delete(localCaptureKey(recordingId, sequence)));
}

export function localEventKey(recordingId: string, eventId: string) {
  return `${recordingId}:event:${eventId}`;
}

export async function persistLocalEvent(input: Omit<LocalRecordingEvent, "key" | "createdAt">) {
  const value: LocalRecordingEvent = {
    ...input,
    key: localEventKey(input.recordingId, input.eventId),
    createdAt: new Date().toISOString(),
  };
  await transaction(EVENT_STORE, "readwrite", (store) => store.put(value));
  return value;
}

export async function listLocalEvents(recordingId: string) {
  const database = await openDatabase();
  try {
    return await new Promise<LocalRecordingEvent[]>((resolve, reject) => {
      const request = database.transaction(EVENT_STORE, "readonly").objectStore(EVENT_STORE).getAll();
      request.onsuccess = () => resolve((request.result as LocalRecordingEvent[])
        .filter((item) => item.recordingId === recordingId)
        .sort((left, right) => left.clientSequence - right.clientSequence));
      request.onerror = () => reject(request.error || new Error("기기 질문 표시를 읽지 못했습니다."));
    });
  } finally {
    database.close();
  }
}

export async function removeLocalEvent(recordingId: string, eventId: string) {
  await transaction(EVENT_STORE, "readwrite", (store) => store.delete(localEventKey(recordingId, eventId)));
}
