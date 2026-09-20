import type { OliviaClientSearchResult } from "@/lib/olivia/clientSearch";
import type { AssistantChannel } from "@/lib/assistant/types";
import type { OliviaUiAction } from "@/lib/olivia/agent/actionTypes";
import type { OliviaContextSnapshot } from "@/lib/olivia/v2/types";
import type { HermesMemoryEntry } from "@/lib/olivia/memory/format";

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
  /** 현재 요청과 관련된 scope로만 미리 걸러 넘긴 Adaptive Memory. §2 "모든 Memory를 무조건 넣지 않는다". */
  memories?: HermesMemoryEntry[];
  /** 최근 12개 메시지 밖의 더 오래된 대화를 사실 기반으로 압축한 요약. §4C. */
  compactConversationSummary?: string;
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

// Hermes가 OpenAI-compatible SSE의 마지막 usage event를 보내는 배포에서만 채워진다.
// usage를 보내지 않는 Hermes 버전도 정상 동작해야 하므로 모든 필드는 optional이다.
export type HermesUsage = {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
};

export type HermesChatResult = {
  success: true;
  message: string;
  runId: string;
  toolCalls: HermesToolCallRecord[];
  data?: OliviaClientSearchResult;
  usage?: HermesUsage;
};

export type HermesCallbacks = {
  onTextDelta?: (delta: string) => void;
  /** Hermes SSE에서 첫 텍스트 delta가 도착할 때의 Hermes 요청 기준 경과 시간. */
  onFirstTextDelta?: (elapsedMs: number) => void;
  onToolStart?: (tool: string, toolCallId: string) => void;
  onToolResult?: (record: HermesToolCallRecord) => void;
};
