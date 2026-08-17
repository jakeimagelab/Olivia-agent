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
  | { type: "error"; message: string; retryable: boolean };

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

export type OliviaStreamEvent =
  | { type: "message_start"; messageId: string; conversationId?: string }
  | { type: "text_delta"; messageId: string; delta: string }
  | { type: "agent_status"; status: string }
  | { type: "tool_start"; tool: string; toolCallId: string }
  | { type: "tool_result"; tool: string; toolCallId: string; success: boolean; result?: unknown }
  | { type: "ui_action"; action: OliviaUiAction }
  | { type: "message_complete"; messageId: string; conversationId?: string }
  | { type: "error"; message: string; retryable: boolean };

export function messageText(message: OliviaV2Message) {
  if (message.content) return message.content;
  return message.blocks
    .filter((block): block is Extract<OliviaMessageBlock, { type: "text" }> => block.type === "text")
    .map((block) => block.text)
    .join("");
}
