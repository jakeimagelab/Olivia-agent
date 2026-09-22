import type { OliviaContextSnapshot } from "@/lib/olivia/v2/types";
import { hasOliviaFastCommandLanguage, hasOliviaToolActionLanguage } from "@/lib/olivia/v2/executionIntent";

export type OliviaRequestClass = "FAST_COMMAND" | "NORMAL_CHAT" | "REASONING" | "TOOL_ACTION";

const REASONING_PATTERN = /(전략|깊게\s*분석|전체\s*분석|완전히\s*다시|기획|비교|진단|로드맵)/;
export function classifyOliviaRequest(message: string, context: OliviaContextSnapshot): OliviaRequestClass {
  const normalized = message.trim();
  if (REASONING_PATTERN.test(normalized)) return "REASONING";
  if (hasOliviaToolActionLanguage(normalized)) return "TOOL_ACTION";
  if (context.activeWorkspace && (context.selectedEntityId || context.activeResourceId) && /^(이거|그거|아까\s*거|\d+번|두\s*개|[\d,.]+\s*(으로|로))/.test(normalized)) {
    return "TOOL_ACTION";
  }
  if (hasOliviaFastCommandLanguage(normalized)) return "FAST_COMMAND";
  return "NORMAL_CHAT";
}

export function routeOliviaModel(requestClass: OliviaRequestClass): string | undefined {
  if (requestClass === "FAST_COMMAND" || requestClass === "TOOL_ACTION") {
    return process.env.OLIVIA_FAST_MODEL || process.env.OLIVIA_DEFAULT_MODEL;
  }
  if (requestClass === "REASONING") {
    return process.env.OLIVIA_REASONING_MODEL || process.env.OLIVIA_DEFAULT_MODEL;
  }
  return process.env.OLIVIA_DEFAULT_MODEL || process.env.OLIVIA_FAST_MODEL;
}
