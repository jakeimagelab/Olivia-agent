import type { OliviaClientSearchResult } from "@/lib/olivia/clientSearch";
import type { AssistantChannel } from "@/lib/assistant/types";
import type { OliviaUiAction } from "@/lib/olivia/agent/actionTypes";
import type { OliviaContextSnapshot } from "@/lib/olivia/v2/types";

export type HermesChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export type HermesChatContext = OliviaContextSnapshot & {
  today?: string;
  channel?: AssistantChannel;
  activeClient?: { id?: string; name?: string };
  activeProject?: { id?: string; name?: string };
  activeResource?: { type?: string; id?: string; title?: string; status?: string; version?: number };
  selectedEntity?: { type?: string; id?: string };
  selectedRowId?: string;
  selectedSceneId?: string;
  selectedScheduleId?: string;
  brand?: string;
  permissions?: { canEdit?: boolean; canFinalize?: boolean };
  workSession?: { id: string; title?: string; status: "active"; resourceType?: string; resourceId?: string; clientId?: string; projectId?: string };
  /** 실제 오늘 날짜(YYYY-MM-DD). "오늘/내일/모레/다음주" 같은 상대 표현을 이 값 기준으로 계산한다. */
  todayDate?: string;
  /** 사용자가 지금 캘린더에서 보고 있는 날짜. 메시지에 날짜가 전혀 없으면 이 날짜를 기본값으로 쓴다. */
  focusDate?: string;
};

export type HermesToolCallRecord = {
  id: string;
  name: string;
  success: boolean;
  result?: OliviaClientSearchResult;
  data?: unknown;
  error?: string;
  code?: string;
  details?: Record<string, unknown>;
  mode?: "read" | "mutation" | "approval" | "ui";
  resourceType?: string;
  resourceId?: string;
  changedEntityId?: string;
  uiToolName?: string;
  verification?: unknown;
  uiActions?: OliviaUiAction[];
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
