import { registerInlineTool } from "@/lib/olivia/inline-tools/registry";
import SelectMatchChatCard from "@/components/olivia/SelectMatchChatCard";
import { useSelectMatchChatStore } from "@/lib/store/useSelectMatchChatStore";

// 이 파일을 import하는 것만으로 등록이 끝난다(side-effect import) — index.ts가 이 파일을
// re-export해서 앱이 레지스트리를 쓰는 지점(OliviaConversation.tsx, useOliviaConversationStore.ts)
// 어디서든 자연히 이 모듈이 먼저 평가된다. 새 Inline Tool을 추가할 때는 이 파일에 한 줄만
// 더 쓰면 된다(registerInlineTool 호출) — 공통 파일은 다시 열 필요가 없다.
export const SELECT_MATCH_TOOL_ID = "select_match";

registerInlineTool({
  id: SELECT_MATCH_TOOL_ID,
  component: SelectMatchChatCard,
  onStart: (flowId) => useSelectMatchChatStore.getState().startFlow(flowId),
  duplicateRunMessage: "현재 셀렉/매칭이 진행 중입니다. 완료 후 다시 시도해주세요.",
});
