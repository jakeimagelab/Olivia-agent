import type { OliviaClientSearchResult } from "@/lib/olivia/clientSearch";

export type HermesChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export type HermesChatContext = {
  activeClientId?: string;
  activeProjectId?: string;
  activeWorkspace?: string;
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
