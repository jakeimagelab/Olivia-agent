import type { OliviaContextSnapshot } from "@/lib/olivia/v2/types";

export type OliviaRequestClass = "FAST_COMMAND" | "NORMAL_CHAT" | "REASONING" | "TOOL_ACTION";

const REASONING_PATTERN = /(전략|깊게\s*분석|전체\s*분석|완전히\s*다시|기획|비교|진단|로드맵)/;
const TOOL_PATTERN = /(만들어|생성|수정|바꿔|추가|삭제|빼|공개|발송|견적|계약|콘티)/;
const FAST_PATTERN = /^(열어|보여|닫아|전체화면|일정|프로젝트|상태|[\d,.]+\s*(으로|로))/;

export function classifyOliviaRequest(message: string, context: OliviaContextSnapshot): OliviaRequestClass {
  const normalized = message.trim();
  if (REASONING_PATTERN.test(normalized)) return "REASONING";
  if (TOOL_PATTERN.test(normalized)) return "TOOL_ACTION";
  if (context.activeWorkspace && (context.selectedEntityId || context.activeResourceId) && /^(이거|그거|아까\s*거|\d+번|두\s*개|[\d,.]+\s*(으로|로))/.test(normalized)) {
    return "TOOL_ACTION";
  }
  if (FAST_PATTERN.test(normalized)) return "FAST_COMMAND";
  return "NORMAL_CHAT";
}

export function routeOliviaModel(requestClass: OliviaRequestClass): string | undefined {
  if (requestClass === "REASONING") {
    return process.env.OLIVIA_REASONING_MODEL || process.env.OLIVIA_DEFAULT_MODEL;
  }
  if (requestClass === "FAST_COMMAND" || requestClass === "TOOL_ACTION") {
    return process.env.OLIVIA_FAST_MODEL || process.env.OLIVIA_DEFAULT_MODEL;
  }
  return process.env.OLIVIA_DEFAULT_MODEL;
}
