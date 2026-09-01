import type { OliviaUiAction } from "@/lib/olivia/agent/actionTypes";
import type { ConversationEntity, EntityAlias, OliviaPageMode, OliviaRecentAction } from "@/lib/store/oliviaContextStore";

export type OliviaLayoutMode =
  | "idle"
  | "conversation"
  | "workspace"
  | "workspace-chat-expanded"
  | "fullscreen";

export type OliviaMessageBlock =
  | { type: "text"; text: string }
  | { type: "status"; text: string }
  | { type: "resource_card"; resourceType: string; resourceId: string; title?: string; summary?: string }
  | { type: "approval"; approvalId: string; summary: string; toolName: string; toolInput: Record<string, unknown>; confirmLabel: string; state?: "pending" | "approved" | "cancelled" | "error" }
  | { type: "action"; label: string; action: OliviaUiAction }
  // 채팅 안에서 실제 작업(파일시스템 접근 등 브라우저 전용 로직)을 끝까지 수행하는 카드 —
  // flowId는 opaque 참조일 뿐, 실제 진행 상태는 client-only 스토어(예: useSelectMatchChatStore)에
  // 있다. FileSystemHandle 등 직렬화 불가능한 값은 절대 이 블록에 담지 않는다(메시지는 JSON으로
  // 저장/캐시됨). task는 문자열 유니온으로 다른 도구를 같은 패턴에 추가할 때 이어붙인다.
  // task는 Inline Tool Registry(lib/olivia/inline-tools)의 등록 id를 가리키는 opaque 문자열이다
  // — 새 도구가 추가돼도 이 파일을 다시 열 필요가 없도록 리터럴 유니온으로 제한하지 않는다.
  | { type: "client_task"; flowId: string; task: string; state?: "pending" | "in_progress" | "done" | "cancelled" | "error" }
  | { type: "error"; message: string; retryable: boolean }
  // 촬영일이 지났는데 워크플로우가 아직 "촬영" 단계에 머물러 있는 고객을 홈 채팅에서 먼저
  // 물어보는 카드 — /api/olivia/shoot-confirmations가 감지해서 만든 insight 1건과 대응된다.
  | { type: "shoot_confirm"; insightId: string; workflowRunId: string; clientName: string; shootDate: string; state?: "pending" | "confirmed" | "snoozed" | "error" };

export type OliviaMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  blocks: OliviaMessageBlock[];
  createdAt?: string;
  status?: "sending" | "streaming" | "complete" | "stopped" | "error";
  clientRequestId?: string;
};

export type OliviaV2Message = OliviaMessage;

export type OliviaContextSnapshot = {
  pathname?: string;
  activeClientId?: string;
  activeClientName?: string;
  activeProjectId?: string;
  activeProjectName?: string;
  activeWorkspace?: string;
  activeResourceId?: string;
  selectedEntityType?: string;
  selectedEntityId?: string;
  selectedScheduleId?: string;
  recentActions: OliviaRecentAction[];
  recentEntities?: ConversationEntity[];
  aliases?: Record<string, EntityAlias>;
  revision: number;
  lastTool?: string;
  lastIntent?: string;
  currentDocumentId?: string;
  currentDocumentType?: string;
  currentDocumentTitle?: string;
  // 견적 Chat-native Workflow(PHASE 2) — 지금 열려 있는 문서의 실시간 합계/미저장 편집 여부.
  // 모델이 총액을 스스로 계산해서 말하지 않고 이 값을 그대로 전달하게 하기 위함(스펙 §21).
  currentDocumentTotal?: number;
  currentDocumentDirty?: boolean;
  pageMode?: OliviaPageMode;
  capabilities?: string[];
  selectedRowId?: string;
  selectedSceneId?: string;
  documentStatus?: string;
  brand?: string;
  canEdit?: boolean;
  canFinalize?: boolean;
};

export type OliviaToolCall = { id: string; name: string; arguments: string };

// Agent 실행 구조 개편(2026-08-31) — "실행했다고 생각함"과 "실제 결과를 확인함"을 구분한다.
// success는 여전히 "요청의 핵심 목적을 달성했는가"를 뜻하고, verification은 그 판단을 뒷받침하는
// 개별 신호들이다. 전부 optional이라 verification 없이 반환하는 기존 tool도 그대로 동작한다.
export type OliviaToolVerification = {
  executed?: boolean;
  persisted?: boolean;
  uiUpdated?: boolean;
  linked?: boolean;
  resourceExists?: boolean;
  verifiedAt?: string;
  details?: Record<string, boolean | string | number | null>;
};

export type OliviaToolResult = {
  tool: string;
  success: boolean;
  data?: Record<string, unknown>;
  error?: string;
  verification?: OliviaToolVerification;
};

export type OliviaAgentToolExecution = {
  result: OliviaToolResult;
  uiActions: OliviaUiAction[];
};

export type OliviaRunStreamPayload = {
  id: string;
  goal?: string;
  status?: string;
  progress?: number;
  currentStepKey?: string;
  message?: string;
};

export type OliviaStreamEvent =
  | { type: "message_start"; messageId: string; conversationId?: string }
  | { type: "text_delta"; messageId: string; delta: string }
  | { type: "agent_status"; status: string }
  | { type: "tool_start"; tool: string; toolCallId: string }
  | { type: "tool_result"; tool: string; toolCallId: string; success: boolean; result?: unknown }
  | { type: "ui_action"; action: OliviaUiAction }
  | { type: "message_complete"; messageId: string; conversationId?: string }
  | { type: "run_created"; run: OliviaRunStreamPayload }
  | { type: "run_updated"; run: OliviaRunStreamPayload }
  | { type: "run_step_updated"; run: OliviaRunStreamPayload }
  | { type: "run_waiting_approval"; run: OliviaRunStreamPayload }
  | { type: "run_completed"; run: OliviaRunStreamPayload }
  | { type: "run_failed"; run: OliviaRunStreamPayload }
  | { type: "error"; message: string; retryable: boolean };

export function messageText(message: OliviaV2Message) {
  if (message.content) return message.content;
  return message.blocks
    .filter((block): block is Extract<OliviaMessageBlock, { type: "text" }> => block.type === "text")
    .map((block) => block.text)
    .join("");
}
