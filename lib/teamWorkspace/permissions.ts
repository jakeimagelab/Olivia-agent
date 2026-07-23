export type TeamActor = { id: string; isAdmin: boolean };
export type ProjectPermissionRecord = {
  created_by: string;
  owner_id: string | null;
  members?: Array<{ member_id: string; role: string }>;
};
export type TaskPermissionRecord = {
  assignee_id: string | null;
  created_by: string;
  status?: string;
  project?: ProjectPermissionRecord | null;
  projectMember?: boolean;
  roomMember?: boolean;
};

export function canViewProject(actor: TeamActor, project: ProjectPermissionRecord): boolean {
  return actor.isAdmin
    || project.created_by === actor.id
    || project.owner_id === actor.id
    || Boolean(project.members?.some((member) => member.member_id === actor.id));
}

export function canEditProject(actor: TeamActor, project: ProjectPermissionRecord): boolean {
  return actor.isAdmin
    || project.created_by === actor.id
    || project.owner_id === actor.id
    || Boolean(project.members?.some(
      (member) => member.member_id === actor.id && ["owner", "manager"].includes(member.role)
    ));
}

export function canViewTask(actor: TeamActor, task: TaskPermissionRecord): boolean {
  return actor.isAdmin
    || task.assignee_id === actor.id
    || task.created_by === actor.id
    || Boolean(task.projectMember)
    || Boolean(task.roomMember)
    || Boolean(task.project && canViewProject(actor, task.project));
}

export function canEditTask(actor: TeamActor, task: TaskPermissionRecord): boolean {
  if (actor.isAdmin || task.created_by === actor.id || task.assignee_id === actor.id) return true;
  return Boolean(task.project && canEditProject(actor, task.project));
}

export function canSubmitTask(actor: TeamActor, task: TaskPermissionRecord): boolean {
  if (task.status !== "in_progress") return false;
  return task.assignee_id === actor.id
    || (actor.isAdmin && task.created_by === actor.id && task.assignee_id === actor.id);
}

export function canApproveTask(actor: TeamActor, task: TaskPermissionRecord): boolean {
  if (task.status !== "review") return false;
  if (task.assignee_id === actor.id) {
    return actor.isAdmin && task.created_by === actor.id;
  }
  return actor.isAdmin
    || task.created_by === actor.id
    || task.project?.owner_id === actor.id;
}

export function canRequestRevision(actor: TeamActor, task: TaskPermissionRecord): boolean {
  return canApproveTask(actor, task);
}
