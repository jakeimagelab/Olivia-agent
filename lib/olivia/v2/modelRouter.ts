import type { OliviaContextSnapshot } from "@/lib/olivia/v2/types";
import { hasOliviaFastCommandLanguage, hasOliviaToolActionLanguage, isClientScopedExecutionRequest } from "@/lib/olivia/v2/executionIntent";

export type OliviaRequestClass = "FAST_COMMAND" | "NORMAL_CHAT" | "REASONING" | "TOOL_ACTION";

const REASONING_PATTERN = /(전략|깊게\s*분석|전체\s*분석|완전히\s*다시|기획|비교|진단|로드맵)/;
const SHORT_UTTERANCE_MAX_LENGTH = 20;

// PHASE 4 작업 3(2026-09-25) — 정규식(말투)보다 Context(상황)를 먼저 본다. 문서가 열려 있거나
// workspace에서 뭔가 선택된 채로 짧게 말하면, 정규식이 못 잡는 표현("1500으로", "이대로", "응")도
// 전부 그 대상에 대한 실행으로 본다. 예전엔 이 조건이 좁은 지시어 화이트리스트 정규식
// (이거/그거/아까거/숫자번 등) 하나로만 잡혀 있었는데, currentDocumentId 기반 판단이 사실상
// 상위호환이라 그 정규식 분기를 없애고 여기 하나로 합쳤다(분기를 늘리지 않고 줄인다).
function hasShortOpenTargetUtterance(normalized: string, context: OliviaContextSnapshot): boolean {
  if (normalized.length > SHORT_UTTERANCE_MAX_LENGTH) return false;
  if (context.currentDocumentId) return true;
  return Boolean(context.activeWorkspace && (context.selectedEntityId || context.activeResourceId));
}

export function classifyOliviaRequest(message: string, context: OliviaContextSnapshot): OliviaRequestClass {
  const normalized = message.trim();
  // REASONING을 Context 규칙보다 먼저 본다 — "브랜드 전략 전체 분석해줘"처럼 20자 이하인 깊은
  // 분석 요청이 문서가 열려 있다는 이유만으로 TOOL_ACTION으로 잘못 넘어가면 안 된다(기존 테스트
  // 회귀). 나머지 분기 순서는 작업 지시서 예시 그대로 Context 우선이다.
  if (REASONING_PATTERN.test(normalized)) return "REASONING";
  if (hasShortOpenTargetUtterance(normalized, context)) return "TOOL_ACTION";
  // 고객이 확정된 채로(activeClientId) 자원 이름 + 실행 동사가 함께 오면(예: "견적 승인해") 말투와
  // 무관하게 실행 의도다 — executionIntent.ts의 판정을 그대로 재사용한다(새 판정 안 만듦).
  if (context.activeClientId && isClientScopedExecutionRequest(normalized)) return "TOOL_ACTION";
  if (hasOliviaToolActionLanguage(normalized)) return "TOOL_ACTION";
  if (hasOliviaFastCommandLanguage(normalized)) return "FAST_COMMAND";
  return "NORMAL_CHAT";
}

export function routeOliviaModel(requestClass: OliviaRequestClass): string | undefined {
  if (requestClass === "FAST_COMMAND" || requestClass === "TOOL_ACTION") {
    return process.env.OLIVIA_FAST_MODEL || process.env.OLIVIA_DEFAULT_MODEL;
  }
  if (requestClass === "REASONING") {
    return process.env.OLIVIA_REASONING_MODEL || process.env.OLIVIA_DEFAULT_MODEL;
  }
  return process.env.OLIVIA_DEFAULT_MODEL || process.env.OLIVIA_FAST_MODEL;
}
