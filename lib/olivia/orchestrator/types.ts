import type { OliviaUiAction } from "@/lib/olivia/agent/actionTypes";

export type OliviaRequestClassKind = "NAVIGATION" | "DATA_ACTION" | "DATA_QUERY" | "CONVERSATION";

export type DeterministicOliviaResult = {
  text: string;
  uiActions: OliviaUiAction[];
  routeDecision: string;
};
