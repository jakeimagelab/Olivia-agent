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
  calendarLinked?: boolean;
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
    || Boolean(task.project && canViewProject(actor, task.project))
    // 캘린더 연동 프로젝트는 원본 캘린더 일정처럼 팀 전체에 공개된 정보이므로 모두가 볼 수 있다.
    || Boolean(task.calendarLinked);
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

// 체크리스트 항목의 완료 체크는 그 항목 담당자 본인도 할 수 있다 — 캘린더 연동 프로젝트처럼
// 태스크 자체엔 담당자가 없고 항목별로만 담당자가 있는 경우, canEditTask만으로는 정작 그 업무를
// 맡은 직원이 체크할 수 없기 때문이다. 내용/담당자 변경은 여전히 canEditTask로만 허용한다.
export function canToggleChecklistItem(
  actor: TeamActor,
  task: TaskPermissionRecord,
  checklistItemAssigneeId: string | null,
): boolean {
  return canEditTask(actor, task) || (checklistItemAssigneeId !== null && checklistItemAssigneeId === actor.id);
}
