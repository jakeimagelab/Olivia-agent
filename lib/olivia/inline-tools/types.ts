import type { ComponentType } from "react";

// client_task 블록의 상태 어휘 — lib/olivia/v2/types.ts의 client_task.state와 정확히 같아야 한다.
export type InlineToolState = "pending" | "in_progress" | "done" | "cancelled" | "error";

// 새 Inline Tool(예: quote, contract, storyboard, schedule, document_search)을 추가할 때 손대야
// 하는 유일한 "선언" 지점 — lib/olivia/inline-tools/builtins.ts에 registerInlineTool() 호출을
// 한 줄 추가하면 되고, 공통 파일(OliviaConversation.tsx, useOliviaConversationStore.ts)은 다시
// 열 필요가 없다. component는 채팅 메시지 블록 안에 렌더링되며 flowId 하나만 prop으로 받는
// 계약을 강제한다 — 각 카드가 자기 상태는 자기 client-only 스토어에서 flowId로 읽어온다.
export type InlineToolDefinition = {
  id: string;
  component: ComponentType<{ flowId: string }>;
  // 새 flow를 시작할 때 그 도구 전용 client-only 스토어를 시딩한다(예: useSelectMatchChatStore.startFlow).
  // 프레임워크는 이 스토어의 존재/모양을 모른다 — 도구가 자기 시딩 로직을 통째로 넘겨준다.
  onStart?: (flowId: string, initialData?: Record<string, string | number | boolean | null>) => void;
  // "현재 셀렉/매칭이 진행 중입니다" 같은 중복 실행 가드 문구 — 도구마다 다른 명사를 쓸 수 있어
  // 프레임워크가 문구를 하드코딩하지 않고 도구가 넘긴다(없으면 범용 문구로 대체).
  duplicateRunMessage?: string;
  // 새 카드가 생성될 때 client_task 블록에 넣을 초기 state — 기본값은 "in_progress"
  // (select_match처럼 done/cancelled/error로 끝나는 단계형 흐름과 맞음). quote_preview처럼
  // "완료" 개념이 없는 상시-live 카드는 "done"으로 지정해야, 중복 실행 가드
  // (hasInProgressInlineTool)가 이 카드를 "아직 진행 중"으로 착각해 같은 도구의 새 카드를
  // 영구히 막아버리는 걸 방지한다.
  initialState?: InlineToolState;
};
