export function canPersonSelectReviewerFinalize(reviewer: {
  is_legacy?: boolean | null;
  can_finalize?: boolean | null;
}) {
  // 기존 공용 링크는 별도 검토자 권한이 생기기 전부터 최종 제출이 가능했다.
  // 마이그레이션 기본값(false)이 호환 검토자에게 남아 있어도 기존 동작을 막지 않는다.
  if (reviewer.is_legacy === true) return true;
  return reviewer.can_finalize === true;
}
