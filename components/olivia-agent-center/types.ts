import type { OliviaAgentRun } from "@/lib/olivia/agentRuns/types";

export type AgentCenterItem = Record<string, unknown> & { id: string; title?: string; status?: string; created_at?: string; updated_at?: string };
export type AgentCenterSummary = {
  ok: true; generatedAt: string;
  counts: { running: number; approvals: number; today: number; stalled: number; insights: number; completed: number };
  runningRuns: OliviaAgentRun[]; pendingApprovals: AgentCenterItem[]; todayItems: AgentCenterItem[];
  stalledProjects: AgentCenterItem[]; proactiveInsights: AgentCenterItem[]; recentResults: OliviaAgentRun[];
  partialErrors: string[];
};
