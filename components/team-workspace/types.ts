export const TASK_STATUSES = ["todo", "in_progress", "review", "completed", "on_hold", "canceled"] as const;
export const TASK_PRIORITIES = ["low", "normal", "high", "urgent"] as const;
export const PROJECT_TYPES = ["photo", "film", "web", "ai_system", "branding", "marketing", "internal"] as const;
export const PROJECT_STATUSES = ["planning", "active", "on_hold", "completed", "canceled"] as const;
export const PROJECT_MEMBER_ROLES = ["owner", "manager", "member", "viewer"] as const;
export const GOAL_STATUSES = ["planned", "achieved", "partial", "missed"] as const;

export type TeamTaskStatus = (typeof TASK_STATUSES)[number];
export type TeamTaskPriority = (typeof TASK_PRIORITIES)[number];
export type TeamProjectType = (typeof PROJECT_TYPES)[number];
export type TeamProjectStatus = (typeof PROJECT_STATUSES)[number];
export type ProjectMemberRole = (typeof PROJECT_MEMBER_ROLES)[number];
export type DailyGoalStatus = (typeof GOAL_STATUSES)[number];

export type TeamMember = {
  id: string;
  email: string;
  display_name: string;
  avatar_url: string | null;
  is_admin?: boolean;
};

export type TeamProject = {
  id: string;
  name: string;
  description: string | null;
  project_type: TeamProjectType;
  status: TeamProjectStatus;
  priority: TeamTaskPriority;
  client_id: string | null;
  workflow_run_id: string | null;
  owner_id: string | null;
  created_by: string;
  start_date: string | null;
  due_date: string | null;
  completed_at: string | null;
  progress: number;
  created_at: string;
  updated_at: string;
  owner?: TeamMember | null;
  room?: { id: string; name: string } | null;
  incompleteCount?: number;
  reviewCount?: number;
};

export type TeamTaskChecklistItem = {
  id: string;
  task_id: string;
  content: string;
  completed: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type TeamTaskAttachment = {
  id: string;
  task_id: string;
  uploaded_by: string;
  drive_file_id: string;
  file_name: string;
  mime_type: string | null;
  size_bytes: number | null;
  created_at: string;
};

export type TeamTaskEvent = {
  id: string;
  task_id: string;
  actor_id: string | null;
  event_type: string;
  from_value: string | null;
  to_value: string | null;
  note: string | null;
  created_at: string;
  actor?: TeamMember | null;
};

export type TeamTask = {
  id: string;
  project_id: string | null;
  room_id: string | null;
  source_message_id: string | null;
  title: string;
  description: string | null;
  assignee_id: string | null;
  created_by: string;
  priority: TeamTaskPriority;
  status: TeamTaskStatus;
  start_date: string | null;
  due_date: string | null;
  submitted_at: string | null;
  completed_at: string | null;
  approved_by: string | null;
  approved_at: string | null;
  revision_note: string | null;
  created_at: string;
  updated_at: string;
  assignee?: TeamMember | null;
  creator?: TeamMember | null;
  project?: Pick<TeamProject, "id" | "name" | "owner_id" | "progress" | "status"> | null;
  checklists?: TeamTaskChecklistItem[];
  attachments?: TeamTaskAttachment[];
  events?: TeamTaskEvent[];
  sourceMessage?: {
    id: string;
    room_id: string;
    body: string;
    sender_type: string;
    sender_member_id: string | null;
    created_at: string;
  } | null;
};

export type DailyGoal = {
  id: string;
  member_id: string;
  goal_date: string;
  title: string;
  success_criteria: string | null;
  status: DailyGoalStatus;
  result_note: string | null;
  created_at: string;
  updated_at: string;
  member?: TeamMember;
};

export const TASK_STATUS_LABEL: Record<TeamTaskStatus, string> = {
  todo: "해야 함",
  in_progress: "진행 중",
  review: "확인 요청",
  completed: "완료",
  on_hold: "보류",
  canceled: "취소",
};

export const PRIORITY_LABEL: Record<TeamTaskPriority, string> = {
  low: "낮음",
  normal: "보통",
  high: "높음",
  urgent: "긴급",
};
