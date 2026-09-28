const FAILURE_WINDOW_MS = 5 * 60 * 1_000;
const ESCALATION_THRESHOLD = 3;

const failureTimesByFunction = new Map<string, number[]>();

function failureReason(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object" && "message" in error) return String(error.message);
  return String(error);
}

/**
 * 본작업을 막지 않는 Safely 계열의 실패를 운영 로그에 남긴다.
 * 같은 함수가 5분 안에 세 번 실패하면 경고가 묻히지 않도록 error로 올린다.
 */
export function reportSafelyFailure(
  functionName: string,
  target: string,
  error: unknown,
  now = Date.now(),
): void {
  const recent = (failureTimesByFunction.get(functionName) ?? [])
    .filter((timestamp) => now - timestamp < FAILURE_WINDOW_MS);
  recent.push(now);
  failureTimesByFunction.set(functionName, recent);

  const reason = failureReason(error);
  console.warn(`[safely/${functionName}]`, target, reason);
  if (recent.length >= ESCALATION_THRESHOLD) {
    console.error(`[safely/${functionName}]`, target, `5분 안에 ${recent.length}회 실패`, reason);
  }
}

/** 테스트 간 상태가 섞이지 않게 내부 집계를 비운다. */
export function resetSafelyFailureReportsForTests(): void {
  failureTimesByFunction.clear();
}
