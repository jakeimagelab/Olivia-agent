import type { CreateAgentRunInput } from "./types";

export function planAgentRun(input: CreateAgentRunInput) {
  return [
    { step_key: "resolve_context", order_index: 0, title: "고객·프로젝트 확인", tool_name: null, input_data: input.context ?? {} },
    { step_key: "execute_goal", order_index: 1, title: "요청 업무 실행", tool_name: null, input_data: { goal: input.goal } },
    { step_key: "verify_result", order_index: 2, title: "실제 결과 검증", tool_name: null, input_data: {} },
  ];
}
