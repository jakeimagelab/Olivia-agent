import type { WorkflowPhaseKey } from "@/lib/workflow";
import type { DisplayPublicationStatus, PublicationType } from "./publications";

export type WorkspacePhase = { key: WorkflowPhaseKey; name: string; order: number; status: "completed" | "active" | "pending" };

export type WorkspaceWorkflowSummary = {
  currentStepKey: string;
  currentStepName: string;
  phases: WorkspacePhase[];
  progressPercent: number;
  nextActionLabel: string;
  primaryAction: string;
  primaryActionLabel: string;
};

export type WorkspacePublication = {
  id: string;
  relatedType: PublicationType | string;
  relatedId: string;
  title: string;
  version: number;
  status: string;
  displayStatus: DisplayPublicationStatus;
  publishedAt: string | null;
  publishedBy: string | null;
  revokedAt: string | null;
  updatedAt: string;
};

export type WorkspacePortal = {
  url: string;
  token: string;
  exposedItems: string[];
  progressPercent: number;
  currentStepName: string | null;
};

export type ClientWorkspaceData = {
  client: Record<string, any>;
  projects: Record<string, any>[];
  activeProject: Record<string, any> | null;
  workflowSummary: WorkspaceWorkflowSummary | null;
  publications: WorkspacePublication[];
  portal: WorkspacePortal | null;
  recentActivity: Record<string, any>[];
  memo: string;
};
