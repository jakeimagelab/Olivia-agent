/**
 * Supabase 에러(PostgrestError 등)는 `Error`의 인스턴스가 아니라 { message, details, hint, code }
 * 형태의 평범한 객체다. `error instanceof Error ? error.message : String(error)` 패턴을 쓰면
 * 이런 객체가 catch될 때 String(object)가 "[object Object]"를 반환해 실제 오류 내용이 사라진다.
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message) return message;
  }
  if (typeof error === "string" && error) return error;
  try {
    return JSON.stringify(error);
  } catch {
    return "알 수 없는 오류가 발생했습니다.";
  }
}
