import { resolveFeatureIntent } from "@/lib/olivia/features/resolver";

const QUOTE_HREF = "/quote";
// "페이지"/"화면"을 명시하면 OPEN 의도이므로 이 억제 로직을 건너뛰고 기존
// resolveNavigationCapability(화면 이동) 결과를 그대로 쓴다.
const OPEN_QUALIFIER = /(페이지|화면)/;

// "견적"/"견적서"/"견적 만들어줘"가 /quote의 등록된 별칭(lib/toolNav.ts)과 완전일치하면
// resolveNavigationCapability가 confidence===1로 판단해 GPT를 거치지 않고 곧장 페이지 이동을
// 확정해버린다 — 셀렉/매칭에서 이미 확인된 것과 같은 버그 패턴("셀렉매칭 하자"가 채팅 실행
// 대신 페이지 이동으로 새던 문제, 2026-08-29). 다만 견적 생성은 hospitalName을 문장에서 뽑아야
// 해서 select_match처럼 완전 결정론적으로 바로 실행할 수는 없다 — 여기서는 단지 "페이지 이동을
// 단정하지 말고 GPT+create_quote/open_feature 판단으로 넘겨라"라는 억제 신호만 준다.
// GPT 쪽 판단은 start_quote_wizard(브랜드가 아직 없거나 요청이 막연할 때)와 create_quote(이미
// 충분한 정보가 있을 때) 중 하나로 이어진다 — 견적서 UX 개편(2026-08-31)에서 추가됨, 이 파일의
// 로직 자체는 변경 없음.
export function isQuoteNavigationShortcutBlocked(message: string): boolean {
  const trimmed = message.trim();
  if (!trimmed || OPEN_QUALIFIER.test(trimmed)) return false;
  const resolution = resolveFeatureIntent(trimmed);
  return resolution.kind === "match" && resolution.tool.href === QUOTE_HREF;
}
