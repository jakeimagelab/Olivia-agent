export type PcrmProjectStatus = "active" | "paused" | "completed" | "canceled";

export type PcrmPublicationStatus =
  | "draft"
  | "internal_review"
  | "published"
  | "viewed"
  | "revision_requested"
  | "approved"
  | "completed"
  | "archived";

export type PcrmActorType = "admin" | "client" | "system";

export type PcrmProject = {
  id: string;
  client_id: string;
  project_name: string;
  project_type?: string | null;
  shooting_type?: string | null;
  manager_name?: string | null;
  owner_name?: string | null;
  consultation_date?: string | null;
  shoot_date?: string | null;
  start_date?: string | null;
  expected_completion_date?: string | null;
  expected_contract_amount?: number | null;
  project_memo?: string | null;
  current_step_key: string;
  next_action?: string | null;
  status: PcrmProjectStatus;
  created_at?: string;
  updated_at?: string;
};

export type PcrmPublication = {
  id: string;
  client_id: string;
  workflow_run_id: string;
  related_type: string;
  related_id: string;
  title: string;
  description: string;
  version: number;
  status: PcrmPublicationStatus;
  published_at?: string | null;
  viewed_at?: string | null;
  approved_at?: string | null;
  revision_requested_at?: string | null;
  feedback?: string | null;
  updated_at: string;
};

export type PcrmActivity = {
  id: string;
  client_id: string;
  workflow_run_id?: string | null;
  actor_type: PcrmActorType;
  actor_name: string;
  action_type: string;
  title: string;
  description: string;
  related_type: string;
  related_id: string;
  created_at: string;
};
