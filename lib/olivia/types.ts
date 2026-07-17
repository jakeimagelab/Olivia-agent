export type OliviaActorType = "system" | "admin" | "client" | "staff" | "local_agent";
export type OliviaPermissionLevel = "auto" | "review_required" | "owner_only";
export type OliviaInsightType =
  | "risk"
  | "delay"
  | "missing_data"
  | "customer_waiting"
  | "approval_waiting"
  | "commitment"
  | "opportunity"
  | "marketing"
  | "recommendation"
  | "summary";

export type OliviaEventInput = {
  eventType: string;
  eventSource: string;
  clientId?: string | null;
  projectId?: string | null;
  workflowRunId?: string | null;
  actorType?: OliviaActorType;
  actorId?: string | null;
  payload?: Record<string, unknown>;
  deduplicationKey?: string | null;
  occurredAt?: string;
};

export type OliviaRecommendedAction = {
  actionType: string;
  title: string;
  description: string;
  permissionLevel: OliviaPermissionLevel;
  dueAt?: string | null;
  payload?: Record<string, unknown>;
};

export type OliviaRuleCandidate = {
  ruleId: string;
  insightType: OliviaInsightType;
  title: string;
  summary: string;
  reason: string;
  urgencyScore: number;
  impactScore: number;
  customerRiskScore: number;
  revenueScore: number;
  confidence: number;
  deduplicationKey: string;
  recommendedDueAt?: string | null;
  recommendedAction?: OliviaRecommendedAction | null;
  metadata?: Record<string, unknown>;
};

export type OliviaAnalysisResult = {
  shouldNotify: boolean;
  insightType: Exclude<OliviaInsightType, "summary">;
  title: string;
  summary: string;
  reason: string;
  urgencyScore: number;
  impactScore: number;
  confidence: number;
  recommendedAction: OliviaRecommendedAction | null;
};

export type OliviaWorkflowContext = {
  workflowRun: Record<string, any>;
  client: Record<string, any> | null;
  project: Record<string, any> | null;
  currentStep: Record<string, any> | null;
  stepRuns: Record<string, any>[];
  tasks: Record<string, any>[];
  approvals: Record<string, any>[];
  mailing: Record<string, any>[];
  consultationMemos: Record<string, any>[];
  commitments: Record<string, any>[];
  quotes: Record<string, any>[];
  contracts: Record<string, any>[];
  galleries: Record<string, any>[];
  revisions: Record<string, any>[];
  rewards: Record<string, any>[];
  reviews: Record<string, any>[];
  recentAgentLogs: Record<string, any>[];
  recentEvents: Record<string, any>[];
  unavailableSources: string[];
  now: string;
};
