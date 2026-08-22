import type { OliviaContextSnapshot } from "@/lib/olivia/v2/types";

export const AGENT_RUN_STATUSES = ["queued", "planning", "running", "waiting_approval", "paused", "completed", "failed", "canceled"] as const;
export type AgentRunStatus = typeof AGENT_RUN_STATUSES[number];
export type AgentRunStepStatus = "pending" | "running" | "waiting_approval" | "completed" | "failed" | "skipped" | "canceled";

export type OliviaAgentRun = {
  id: string; owner_id?: string | null; conversation_id?: string | null; client_id?: string | null;
  workflow_run_id?: string | null; source: string; goal: string; run_type: string; status: AgentRunStatus;
  progress: number; current_step_key?: string | null; result_summary?: string; error_message?: string;
  idempotency_key: string; context: OliviaContextSnapshot | Record<string, unknown>; metadata: Record<string, unknown>;
  attempt_count: number; max_attempts: number; lease_owner?: string | null; lease_expires_at?: string | null;
  started_at?: string | null; completed_at?: string | null; created_at: string; updated_at: string;
};

export type OliviaAgentRunStep = {
  id: string; run_id: string; step_key: string; order_index: number; title: string; tool_name?: string | null;
  status: AgentRunStepStatus; input_data: Record<string, unknown>; output_data: Record<string, unknown>;
  approval_id?: string | null; error_message?: string; attempt_count: number; started_at?: string | null;
  completed_at?: string | null; created_at: string; updated_at: string;
};

export type CreateAgentRunInput = {
  ownerId?: string; conversationId?: string; clientId?: string; workflowRunId?: string;
  goal: string; source?: string; runType?: string; idempotencyKey: string;
  context?: OliviaContextSnapshot | Record<string, unknown>; metadata?: Record<string, unknown>;
};
