import type { OliviaUiAction } from "@/lib/olivia/agent/actionTypes";
import type { ConversationEntity, EntityAlias, OliviaRecentAction } from "@/lib/store/oliviaContextStore";

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
};

export type OliviaToolCall = { id: string; name: string; arguments: string };

export type OliviaToolResult = {
  tool: string;
  success: boolean;
  data?: Record<string, unknown>;
  error?: string;
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
