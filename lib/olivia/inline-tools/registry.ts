import type { InlineToolDefinition } from "@/lib/olivia/inline-tools/types";
import type { OliviaMessage } from "@/lib/olivia/v2/types";

// 플레인 Map — zustand store가 아니다. 이 레지스트리는 순수 조회용 정적 등록 테이블이고 값은
// 컴포넌트 참조/콜백 등 비직렬화 값이라 store가 될 이유가 없다. builtins.ts의
// registerInlineTool() 호출들이 모듈 로드 시점에 여기를 채운다.
const registry = new Map<string, InlineToolDefinition>();

export function registerInlineTool(definition: InlineToolDefinition) {
  if (registry.has(definition.id)) {
    // 중복 등록은 항상 버그(같은 id를 두 tool이 씀) — 조용히 덮어쓰면 나중에 디버깅하기
    // 어려우니 개발 중 바로 드러나게 throw한다.
    throw new Error(`Inline tool "${definition.id}" is already registered.`);
  }
  registry.set(definition.id, definition);
}

export function getInlineTool(id: string): InlineToolDefinition | undefined {
  return registry.get(id);
}

export function hasInlineTool(id: string): boolean {
  return registry.has(id);
}

// 같은 task가 이미 in_progress 상태로 열려 있는지 검사한다 — useOliviaConversationStore.ts의
// OPEN_CLIENT_TASK 분기가 새 flow를 시작하기 전에 부른다. SSE 스트림 처리 클로저 안에 로직을
// 그대로 두면 순수 함수로 단위 테스트할 수 없어 이 부분만 분리했다.
export function hasInProgressInlineTool(messages: OliviaMessage[], task: string): boolean {
  return messages.some((message) =>
    message.blocks.some((block) => block.type === "client_task" && block.task === task && block.state === "in_progress"),
  );
}
