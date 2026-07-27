type DatabaseErrorLike = {
  code?: string | null;
  message?: string | null;
};

// 아직 마이그레이션이 적용되지 않아 컬럼이 없는 환경에서도 요청 전체가 500으로 죽지 않도록,
// "컬럼 없음" 에러인지 범용으로 판별한다 (특정 컬럼명에 묶이지 않음).
export function isMissingColumnError(error: DatabaseErrorLike | null | undefined) {
  if (!error) return false;
  const message = String(error.message || "").toLowerCase();
  return error.code === "42703"
    || error.code === "PGRST204"
    || message.includes("does not exist")
    || message.includes("could not find");
}
