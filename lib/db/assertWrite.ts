import type { PostgrestError } from "@supabase/supabase-js";

/**
 * Supabase 쓰기 결과를 검사한다. 실패를 조용히 지나치지 않는다.
 *
 * 배경(2026-09-29): 쓰기 실패가 error 반환값에만 남아 단계 전환이나
 * 작업 생성이 실패해도 화면은 성공한 것처럼 보일 수 있었다.
 */
export function assertWrite(
  result: { error: PostgrestError | null },
  what: string,
): void {
  if (!result.error) return;
  console.error("[db/write]", what, result.error.message);
  throw new Error(`${what}에 실패했습니다: ${result.error.message}`);
}

/**
 * 실패해도 본작업을 막으면 안 되는 부가 기록용. 버리지 말고 반드시 남긴다.
 */
export function logWriteFailure(
  result: { error: PostgrestError | null },
  what: string,
): boolean {
  if (!result.error) return true;
  console.warn("[db/write-optional]", what, result.error.message);
  return false;
}
