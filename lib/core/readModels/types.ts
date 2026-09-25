export type CoreResourceType =
  | "quote"
  | "contract"
  | "conti"
  | "photo_project"
  | "select_gallery"
  | "photo_gallery";

export type CoreResourceSourceTable =
  | "quotes"
  | "contracts"
  | "conti_runs"
  | "conti_saves"
  | "photo_storage_projects"
  | "select_galleries"
  | "photo_galleries";

export type CoreResourceRef = {
  type: CoreResourceType;
  id: string;
  status?: string | null;
  title?: string | null;
  clientId?: string | null;
  workflowRunId: string;
  sourceTable?: CoreResourceSourceTable;
  createdAt?: string | null;
  updatedAt?: string | null;
};

export type CoreResourceRegistry = {
  quote: (CoreResourceRef & { approved: boolean }) | null;
  contract: (CoreResourceRef & { sourceQuoteId?: string | null }) | null;
  conti: CoreResourceRef | null;
  photoProject: CoreResourceRef | null;
  selectGallery: CoreResourceRef | null;
  photoGallery: CoreResourceRef | null;
};

export type CoreWorkflowStepStatus =
  | "pending"
  | "in_progress"
  | "waiting_approval"
  | "completed"
  | "skipped"
  | "failed";

export type CoreWorkflowStepState = {
  key: string;
  status: CoreWorkflowStepStatus;
};

export type CoreProjectSnapshot = {
  client: {
    id: string | null;
    name: string;
  };
  project: {
    workflowRunId: string;
    projectId: string | null;
    name: string;
    status: string;
  };
  workflow: {
    currentStep: string;
    currentStepName: string;
    completedSteps: string[];
    stepStates: CoreWorkflowStepState[];
    nextStep: string | null;
    progressPercent: number;
  };
  resources: CoreResourceRegistry;
  nextAction: {
    label?: string;
    primaryAction?: string | null;
    primaryActionLabel?: string | null;
  };
  consistency: {
    ok: boolean;
    issues: string[];
  };
  generatedAt: string;
};
