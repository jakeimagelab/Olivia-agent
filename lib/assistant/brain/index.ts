export type { BrainChatInput, BrainChatResult, BrainMessageResult, BrainPlanResult, BrainToolCallResult, OliviaBrain } from "./types";
export { BrainUnavailableError } from "./types";
export { hermesProvider } from "./hermesProvider";

import { BrainUnavailableError } from "./types";

export function isBrainFallbackSafe(error: unknown): boolean {
  return error instanceof BrainUnavailableError && error.fallbackSafe;
}

// FallbackProvider(OliviaBrain 구현체로서의 OpenAI 경로)는 아직 분리하지 않았다.
//
// app/api/olivia/v2/stream/route.ts 안의 OpenAI Responses API 루프(약 300줄, OLIVIA_V2_TOOLS
// function-calling + 6라운드 tool loop)는 SSE `send()`, 대화 저장, pending action 상태 등
// 라우트 로컬 클로저와 깊게 얽혀 있다. 지금 억지로 이 인터페이스 뒤로 추출하면 실제 트래픽을
// 받는 채팅 스트리밍이 깨질 위험이 커서(요청서 §1 "절대 하지 말 것: 기존 기능 전체 재작성"),
// 이번 phase에서는 손대지 않았다.
//
// 실질적인 fallback은 지금도 동작한다 — app/api/olivia/v2/stream/route.ts의
// `activeAgentEngine = "legacy"` 분기가 그 역할을 한다(hermesProvider.chat()이
// BrainUnavailableError(fallbackSafe:true)를 던지면 그 분기로 빠진다). 다음 단계에서
// 이 OpenAI 루프를 별도 함수로 뽑아 FallbackProvider로 감싸는 작업을 권장한다
// (docs/superpowers/specs의 최종 보고서 "다음 단계" 항목 참고).
