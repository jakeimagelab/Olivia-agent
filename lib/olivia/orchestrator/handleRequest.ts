import type { OliviaContextSnapshot } from "@/lib/olivia/v2/types";
import type { OliviaRuntimeContext } from "@/lib/olivia/runtime/types";
import { answerRuntimeQuery } from "./runtimeIntent";
import { resolveNavigationCapability } from "@/lib/olivia/capabilities/resolver";
import { buildOpenFeatureAction } from "@/lib/olivia/capabilities/executor";
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

  const navigation = resolveNavigationCapability(message);
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
