import { resolveFeatureIntent } from "@/lib/olivia/features/resolver";

const SELECT_MATCH_HREFS = new Set(["/select-match", "/photo-sorting?tool=select-raw"]);
// "페이지"/"화면"을 명시하면 OPEN 의도이므로 이 결정론적 RUN 경로를 건너뛰고 기존
// resolveNavigationCapability(화면 이동) 쪽으로 넘긴다.
const OPEN_QUALIFIER = /(페이지|화면)/;

// "셀렉매칭"/"매칭"처럼 /select-match의 등록된 별칭(lib/toolNav.ts)과 정확히 같은 문장을
// 그대로 입력하면, resolveNavigationCapability가 confidence===1(완전 일치)로 판단해 GPT를
// 거치지 않고 곧바로 페이지 이동을 확정해버린다 — 사용자가 "채팅에서 바로 실행"하려는 의도
// (RUN)였어도 검증 없이 OPEN으로 새는 구조적 허점이다(2026-08-29 사용자 리포트). 그 경로에
// 도달하기 전에 먼저 이 함수로 select-match RUN 의도인지 확인한다.
export function isSelectMatchRunIntent(message: string): boolean {
  const trimmed = message.trim();
  if (!trimmed || OPEN_QUALIFIER.test(trimmed)) return false;
  const resolution = resolveFeatureIntent(trimmed);
  // ambiguous(다른 "셀렉" 계열 기능과 겹침)면 여기서 단정하지 않고 기존 경로(GPT/후보 제시)로
  // 넘긴다 — select-match로 확실히 좁혀진 경우만 결정론적으로 가로챈다.
  return resolution.kind === "match" && SELECT_MATCH_HREFS.has(resolution.tool.href);
}
