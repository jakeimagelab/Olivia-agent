import type { AgentRunStatus } from "./types";

const TRANSITIONS: Record<AgentRunStatus, readonly AgentRunStatus[]> = {
  queued: ["planning", "running", "canceled"], planning: ["running", "failed", "canceled"],
  running: ["waiting_approval", "paused", "completed", "failed", "canceled"],
  waiting_approval: ["running", "failed", "canceled"], paused: ["queued", "running", "canceled"],
  completed: [], failed: ["queued"], canceled: [],
};

export function canTransitionAgentRun(from: AgentRunStatus, to: AgentRunStatus) {
  return from === to || TRANSITIONS[from].includes(to);
}

export function assertAgentRunTransition(from: AgentRunStatus, to: AgentRunStatus) {
  if (!canTransitionAgentRun(from, to)) throw new Error(`허용되지 않은 Agent Run 상태 전이입니다: ${from} → ${to}`);
}

export function isAgentRunLeaseClaimable(status:AgentRunStatus,leaseExpiresAt:string|null|undefined,now=new Date()){
  if(status==="queued") return true;
  if(status!=="planning"&&status!=="running") return false;
  return !leaseExpiresAt || new Date(leaseExpiresAt).getTime()<=now.getTime();
}
