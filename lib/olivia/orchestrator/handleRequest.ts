import type { OliviaContextSnapshot } from "@/lib/olivia/v2/types";
import type { OliviaRuntimeContext } from "@/lib/olivia/runtime/types";
import { answerRuntimeQuery } from "./runtimeIntent";
import { resolveNavigationCapability } from "@/lib/olivia/capabilities/resolver";
import { buildOpenFeatureAction } from "@/lib/olivia/capabilities/executor";
import { isSelectMatchRunIntent } from "@/lib/olivia/capabilities/selectMatchIntent";
import { isQuoteNavigationShortcutBlocked } from "@/lib/olivia/capabilities/quoteCreateIntent";
import type { DeterministicOliviaResult } from "./types";

// Olivia Orchestrator의 핵심 결정 함수. "GPT가 모든 요청의 첫 관문이 되면 안 된다"는 원칙에 따라
// app/api/olivia/v2/stream/route.ts는 OpenAI를 부르기 전에 이 함수를 먼저 호출한다.
// null이 아닌 결과가 오면 GPT를 아예 호출하지 않고 그 결과를 그대로 스트리밍한다.
//
// 여기서 처리하지 않는 모든 것(모호한 대상 해석, 복합 계획, 실제 데이터 mutation, 분석/대화)은
// 그대로 기존 GPT+Tool 경로로 흘러간다 — 이 함수는 "코드가 사실을 확실히 아는 두 가지 경우"
// (오늘/지금이 언제인지, 존재가 확실한 화면을 여는 것)만 가로챈다.
export function resolveDeterministicResponse(
  message: string,
  runtime: OliviaRuntimeContext,
  _context: OliviaContextSnapshot,
): DeterministicOliviaResult | null {
  const runtimeAnswer = answerRuntimeQuery(message, runtime);
  if (runtimeAnswer) {
    return { text: runtimeAnswer, uiActions: [], routeDecision: "RUNTIME_QUERY" };
  }

  // 일반 네비게이션 완전일치 매칭(아래)보다 먼저 확인한다 — "셀렉매칭"/"매칭"처럼 /select-match의
  // 등록된 별칭과 정확히 같은 문장은 resolveNavigationCapability에서 confidence===1로 잡혀 검증
  // 없이 페이지 이동이 확정되는데, 이 요청은 대부분 "채팅에서 바로 실행해달라"(RUN)는 의도였다
  // (2026-08-29 사용자 리포트). "페이지"/"화면"을 명시한 경우는 selectMatchIntent.ts가 스스로
  // false를 반환해 아래 OPEN 경로로 자연스럽게 넘어간다.
  if (isSelectMatchRunIntent(message)) {
    return {
      text: "셀렉/RAW 매칭을 시작할게요.",
      uiActions: [{ type: "OPEN_CLIENT_TASK", task: "select_match", flowId: crypto.randomUUID() }],
      routeDecision: "SELECT_MATCH_RUN_INTENT",
    };
  }

  const navigation = resolveNavigationCapability(message);
  // "견적"/"견적서"/"견적 만들어줘"처럼 /quote 별칭과 완전일치하는 문장은, "페이지"/"화면"을
  // 명시하지 않은 이상 대부분 "채팅에서 바로 견적을 만들어달라"(create_quote, RUN)는 의도다 —
  // 여기서 그냥 통과시키면 검증 없이 페이지 이동이 확정돼버린다(셀렉/매칭과 동일 버그 패턴,
  // 2026-08-29). 견적은 hospitalName을 문장에서 뽑아야 해서 select_match처럼 완전 결정론적으로
  // 바로 실행할 수는 없으므로, 여기서는 단정하지 않고 GPT+tool 판단으로 넘긴다(null 반환).
  if (navigation.kind === "match" && isQuoteNavigationShortcutBlocked(message)) {
    return null;
  }
  if (navigation.kind === "match") {
    return {
      text: `${navigation.tool.title} 화면을 열었어요.`,
      uiActions: [buildOpenFeatureAction(navigation.tool)],
      routeDecision: "NAVIGATION_MATCH",
    };
  }
  if (navigation.kind === "ambiguous") {
    const names = navigation.candidates.map((c) => c.title).join(", ");
    return {
      text: `${names} 중 어떤 걸 열까요?`,
      uiActions: [],
      routeDecision: "NAVIGATION_AMBIGUOUS",
    };
  }

  return null;
}
