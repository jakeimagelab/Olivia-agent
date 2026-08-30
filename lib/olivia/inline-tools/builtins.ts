import { registerInlineTool } from "@/lib/olivia/inline-tools/registry";
import SelectMatchChatCard from "@/components/olivia/SelectMatchChatCard";
import { useSelectMatchChatStore } from "@/lib/store/useSelectMatchChatStore";
import QuotePreviewChatCard from "@/components/olivia/QuotePreviewChatCard";
import ContractPreviewChatCard from "@/components/olivia/ContractPreviewChatCard";
import ContractSignaturePad from "@/components/olivia/ContractSignaturePad";
import PhotoClassificationChatCard from "@/components/olivia/PhotoClassificationChatCard";
import { usePhotoClassificationChatStore } from "@/lib/store/usePhotoClassificationChatStore";
import QuoteWizardChatCard from "@/components/olivia/QuoteWizardChatCard";
import { useQuoteWizardChatStore } from "@/lib/store/useQuoteWizardChatStore";

// 이 파일을 import하는 것만으로 등록이 끝난다(side-effect import) — index.ts가 이 파일을
// re-export해서 앱이 레지스트리를 쓰는 지점(OliviaConversation.tsx, useOliviaConversationStore.ts)
// 어디서든 자연히 이 모듈이 먼저 평가된다. 새 Inline Tool을 추가할 때는 이 파일에 한 줄만
// 더 쓰면 된다(registerInlineTool 호출) — 공통 파일은 다시 열 필요가 없다.
export const SELECT_MATCH_TOOL_ID = "select_match";
export const QUOTE_PREVIEW_TOOL_ID = "quote_preview";
export const CONTRACT_PREVIEW_TOOL_ID = "contract_preview";
export const CONTRACT_SIGNATURE_TOOL_ID = "contract_signature";
export const PHOTO_CLASSIFICATION_TOOL_ID = "photo_classification";

registerInlineTool({
  id: SELECT_MATCH_TOOL_ID,
  component: SelectMatchChatCard,
  onStart: (flowId) => useSelectMatchChatStore.getState().startFlow(flowId),
  duplicateRunMessage: "현재 셀렉/매칭이 진행 중입니다. 완료 후 다시 시도해주세요.",
});

registerInlineTool({
  id: QUOTE_PREVIEW_TOOL_ID,
  component: QuotePreviewChatCard,
  // useQuoteStore를 직접 구독하는 live 카드라 별도로 시딩할 client-only 세션 상태가 없다.
  // "완료" 개념도 없으므로 in_progress 기본값 대신 done으로 시작해, 같은 대화에서 두 번째
  // 견적을 만들 때 중복 실행 가드가 새 Preview 카드를 막지 않게 한다.
  initialState: "done",
});

registerInlineTool({
  id: CONTRACT_PREVIEW_TOOL_ID,
  component: ContractPreviewChatCard,
  // quote_preview와 같은 이유 — 자체 fetch로 live하게 갱신되고 "완료" 개념이 없다(PHASE 3).
  initialState: "done",
});

registerInlineTool({
  id: CONTRACT_SIGNATURE_TOOL_ID,
  component: ContractSignaturePad,
  duplicateRunMessage: "현재 서명 패드가 이미 열려 있습니다. 완료 후 다시 시도해주세요.",
});

registerInlineTool({
  id: PHOTO_CLASSIFICATION_TOOL_ID,
  component: PhotoClassificationChatCard,
  onStart: (flowId) => usePhotoClassificationChatStore.getState().startFlow(flowId),
  duplicateRunMessage: "현재 사진 분류가 진행 중입니다. 완료 후 다시 시도해주세요.",
});
