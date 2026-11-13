export type WorkerJsonRecord = Record<string, unknown>;

export function workerStringValue(
  payload: WorkerJsonRecord,
  key: string,
  required = false,
): string | undefined {
  const value = payload[key];
  if (value === undefined || value === null || value === "") {
    if (required) throw new Error(`${key} 값이 필요합니다.`);
    return undefined;
  }
  if (typeof value !== "string") throw new Error(`${key} 값은 문자열이어야 합니다.`);
  return value;
}

export function workerNumberValue(payload: WorkerJsonRecord, key: string): number | undefined {
  const value = payload[key];
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${key} 값은 숫자여야 합니다.`);
  }
  return value;
}

export function workerBooleanValue(payload: WorkerJsonRecord, key: string): boolean | undefined {
  const value = payload[key];
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "boolean") throw new Error(`${key} 값은 boolean이어야 합니다.`);
  return value;
}

export function workerStringArrayValue(payload: WorkerJsonRecord, key: string): string[] | undefined {
  const value = payload[key];
  if (value === undefined || value === null) return undefined;
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string")) {
    throw new Error(`${key} 값은 문자열 배열이어야 합니다.`);
  }
  return value;
}
