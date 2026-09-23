export const APP_WINDOW_ERROR_RETRY_LIMIT = 3;

export type AppWindowErrorRecovery = {
  counts: Readonly<Record<string, number>>;
  fingerprint: string;
  occurrenceCount: number;
  locked: boolean;
};

function normalizeFingerprintPart(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

/**
 * 같은 창에서 같은 오류가 반복되는지를 판별하는 안정적인 지문이다.
 * componentStack을 포함해 서로 다른 컴포넌트의 동일 문구 오류는 따로 센다.
 */
export function getAppWindowErrorFingerprint(error: unknown, componentStack = "") {
  const name = error instanceof Error ? error.name : typeof error;
  const message = error instanceof Error ? error.message : String(error);
  return [name, message, componentStack]
    .map(normalizeFingerprintPart)
    .filter(Boolean)
    .join("|");
}

export function recordAppWindowError(
  counts: Readonly<Record<string, number>>,
  fingerprint: string,
): AppWindowErrorRecovery {
  const occurrenceCount = (counts[fingerprint] ?? 0) + 1;
  return {
    counts: { ...counts, [fingerprint]: occurrenceCount },
    fingerprint,
    occurrenceCount,
    locked: occurrenceCount >= APP_WINDOW_ERROR_RETRY_LIMIT,
  };
}
