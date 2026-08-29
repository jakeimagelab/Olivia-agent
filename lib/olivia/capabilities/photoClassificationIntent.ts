// quote/contract의 "페이지"/"화면"만으로는 부족했다 — "사진분류 열어줘"처럼 명시적 오픈 동사가
// 있는데도 "페이지"/"화면"이라는 단어 자체는 없는 기존 회귀 테스트(N5)가 있어서, resolveFeatureIntent
// 의 FILLER_WORDS와 같은 "열어달라" 계열 동사도 함께 OPEN 신호로 인정한다(PHASE 4, 2026-08-30).
const OPEN_QUALIFIER = /(페이지|화면|열어|보여줘|보여봐|띄워줘|띄워)/;
// "사진 분류하자"/"사진 정리하자"/"촬영사진 분류해"/"씬 분류해"/"사진 분류해야 해" 같은 스펙
// §2 예시 문장을 전부 잡아야 하는데, resolveFeatureIntent(lib/olivia/features/resolver.ts)의
// 범용 퍼지 매칭은 "씬 분류해"처럼 /photo-sorting 별칭("사진분류","사진 작업실")과 겹치는
// 부분이 없는 문장은 못 잡는다(bigram 유사도가 임계값 미달) — select-match/quote/contract와
// 달리 이번엔 전용 키워드 패턴으로 직접 판단한다(PHASE 4, 2026-08-30).
const TRIGGER_PATTERN = /(사진|촬영사진|씬)\s*(분류|정리)/;

// 사진 분류는 select_match와 마찬가지로 채팅 안에서 단계별로 설정을 모으는 흐름이라, 첫
// 메시지 시점에 어떤 파라미터도 필요 없다 — 완전 결정론적으로 바로 Inline Tool을 띄울 수
// 있다(GPT 호출 없음). "페이지"/"화면"이 명시되면 기존 /photo-sorting 네비게이션으로 넘긴다.
export function isPhotoClassificationRunIntent(message: string): boolean {
  const trimmed = message.trim();
  if (!trimmed || OPEN_QUALIFIER.test(trimmed)) return false;
  return TRIGGER_PATTERN.test(trimmed);
}
