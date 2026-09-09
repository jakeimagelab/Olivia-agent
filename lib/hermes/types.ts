import type { OliviaClientSearchResult } from "@/lib/olivia/clientSearch";

export type HermesChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export type HermesChatContext = {
  activeClientId?: string;
  activeProjectId?: string;
  activeWorkspace?: string;
};

export type HermesToolCallRecord = {
  id: string;
  name: string;
  success: boolean;
  result?: OliviaClientSearchResult;
  data?: unknown;
  error?: string;
};

export type HermesChatResult = {
  success: true;
  message: string;
  runId: string;
  toolCalls: HermesToolCallRecord[];
  data?: OliviaClientSearchResult;
};

export type HermesCallbacks = {
  onTextDelta?: (delta: string) => void;
  onToolStart?: (tool: string, toolCallId: string) => void;
  onToolResult?: (record: HermesToolCallRecord) => void;
};
