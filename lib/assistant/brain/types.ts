import type { HermesChatContext, HermesChatMessage, HermesToolCallRecord } from "@/lib/hermes/types";

// Olivia OS 2.0 — Hermes를 기본 Brain으로 전환(요청서 §2-3).
//
// 이 타입은 요청서의 예시를 그대로 베끼지 않고 실제 코드에 맞췄다:
// - availableTools/relevantMemory를 caller가 매 요청 명시적으로 넘기지 않는다. Hermes는 MCP로
//   Tool을 스스로 discover하고(lib/hermes/mcp/oliviaToolBridge.ts), 학습된 규칙은 system prompt
//   생성 시점에 이미 주입된다(lib/hermes/systemPrompt.ts, lib/olivia/memory/*) — 그래서 여기서
//   다시 파라미터로 흉내내지 않는다(중복 구현 금지, 요청서 §1).
// - pageContext/userContext/projectContext는 이미 HermesChatContext(OliviaContextSnapshot 확장)
//   하나가 담당한다 — 굳이 3개 필드로 쪼개지 않는다.
export type BrainChatInput = {
  conversationId: string;
  message: string;
  history?: HermesChatMessage[];
  context?: HermesChatContext;
  signal?: AbortSignal;
  callbacks?: {
    onTextDelta?: (delta: string) => void;
    onToolStart?: (tool: string, toolCallId: string) => void;
    onToolResult?: (record: HermesToolCallRecord) => void;
  };
};

// 1. 일반 대화 — Hermes/legacy가 Tool 없이(또는 Tool 실행까지 마치고) 최종 답변만 낸 경우.
// 이 구현체의 Hermes 경로는 Tool 호출을 자기 루프 안에서 끝내고 최종 텍스트만 돌려주므로,
// toolCalls는 "무엇을 실행했는지"를 caller(UI 반영/승인 카드 판단)에게 알려주는 부가 정보다.
export type BrainMessageResult = {
  type: "message";
  text: string;
  runId: string;
  toolCalls: HermesToolCallRecord[];
};

// 2. Tool 실행 요청 — caller가 대신 실행하고 결과를 다시 넣어줘야 하는 경우를 위해 타입은
// 남겨둔다. 지금 유일한 실제 Provider(HermesProvider)는 이 모양을 반환하지 않는다 — Hermes
// 서버가 MCP로 Tool을 직접 호출하고 결과까지 반영한 뒤 응답하기 때문이다(§4/§11 참고).
export type BrainToolCallResult = {
  type: "tool_call";
  tool: { name: string; arguments: Record<string, unknown> };
  runId?: string;
};

// 3. 여러 단계 계획 — 요청서 §12(Multi-step)를 위해 타입만 예약해둔다. 1차 구현 범위 밖.
export type BrainPlanResult = {
  type: "plan";
  steps: Array<{ description: string; tool?: string }>;
  runId?: string;
};

export type BrainChatResult = BrainMessageResult | BrainToolCallResult | BrainPlanResult;

export class BrainUnavailableError extends Error {
  constructor(message: string, public readonly fallbackSafe: boolean) {
    super(message);
    this.name = "BrainUnavailableError";
  }
}

export interface OliviaBrain {
  readonly engine: "hermes" | "legacy";
  chat(input: BrainChatInput): Promise<BrainChatResult>;
}
