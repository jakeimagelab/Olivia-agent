import {
  ACTIVE_WORKFLOW_STEP_KEYS,
  STEP_NAME,
  getWorkflowDisplayStepKey,
  getWorkflowStepProgress,
} from "@/lib/workflow";

export type WorkflowPrimaryAction =
  | "run_current_step"
  | "approve_required"
  | "send_ready_mail"
  | "advance_step"
  | "open_app"
  | "fix_failed_task"
  | "completed";

export type WorkflowNextAction = {
  workflowRunId: string;
  clientId?: string;
  currentStepKey: string;
  currentStepName: string;
  progress: number;
  label: string;
  primaryAction: WorkflowPrimaryAction;
  primaryActionLabel: string;
  severity: "default" | "info" | "warning" | "danger" | "success";
  canRun: boolean;
  canApprove: boolean;
  canAdvance: boolean;
  canSendMail: boolean;
  blockedReason?: string | null;
  tasks: any[];
  approvals: any[];
  mailing: any[];
};

export function buildWorkflowNextAction({
  run,
  tasks,
  approvals,
  mailing,
}: {
  run: any;
  tasks: any[];
  approvals: any[];
  mailing: any[];
}): WorkflowNextAction {
  const stepKey = run?.current_step_key || "consult_meeting";
  const displayStepKey = getWorkflowDisplayStepKey(stepKey);
  const progress = getWorkflowStepProgress(stepKey, run?.status);

  const stepTasks = (tasks || []).filter((task) => task.workflow_step_key ? task.workflow_step_key === stepKey : task.workflow_run_id === run?.id);
  const stepApprovals = (approvals || []).filter((approval) => approval.workflow_step_key ? approval.workflow_step_key === stepKey : approval.workflow_run_id === run?.id);
  const stepMailing = (mailing || []).filter((mail) => mail.workflow_step_key ? mail.workflow_step_key === stepKey : mail.workflow_run_id === run?.id);

  const failedTasks = stepTasks.filter((task) => task.status === "failed");
  const runnableTasks = stepTasks.filter((task) => ["pending", "running"].includes(task.status));
  const pendingApprovals = stepApprovals.filter((approval) => approval.status === "pending" || approval.status === "revision_requested");
  const readyMailing = stepMailing.filter((mail) => mail.status === "ready");
  const openTasks = stepTasks.filter((task) => ["pending", "running", "waiting_approval", "failed"].includes(task.status));

  let primaryAction: WorkflowPrimaryAction = "open_app";
  let label = "관련 앱에서 작업을 이어가세요.";
  let primaryActionLabel = "관련 앱 열기";
  let severity: WorkflowNextAction["severity"] = "default";
  let blockedReason: string | null = null;

  // 셀렉 단계 전용 안내
  if (stepKey === "raw_matching") {
    primaryAction = "open_app";
    label = "고객이 선택을 완료했습니다. RAW 폴더를 선택해 RAW_SELECT를 생성하세요.";
    primaryActionLabel = "RAW 자동 매칭 시작";
    severity = "warning";
  } else if (displayStepKey === "client_selection") {
    primaryAction = "open_app";
    label = "분류된 JPG로 고객 셀렉 갤러리를 만들고 브랜드메일을 보내세요.";
    primaryActionLabel = "셀렉 갤러리 열기";
    severity = "info";
  } else if (
    run?.status === "completed" ||
    (displayStepKey === ACTIVE_WORKFLOW_STEP_KEYS[ACTIVE_WORKFLOW_STEP_KEYS.length - 1] &&
      !openTasks.length &&
      !pendingApprovals.length)
  ) {
    primaryAction = "completed";
    label = "워크플로우가 완료되었습니다.";
    primaryActionLabel = "완료";
    severity = "success";
  } else if (failedTasks.length) {
    primaryAction = "fix_failed_task";
    label = "오류가 발생한 작업이 있습니다.";
    primaryActionLabel = "오류 작업 확인";
    severity = "danger";
    blockedReason = failedTasks[0]?.error_message || "자동화 작업 실패";
  } else if (runnableTasks.length) {
    primaryAction = "run_current_step";
    label = "올리비아가 처리할 작업이 있습니다.";
    primaryActionLabel = "올리비아가 현재 단계 처리하기";
    severity = "info";
  } else if (pendingApprovals.length) {
    primaryAction = "approve_required";
    label = "대표님 승인만 남았습니다.";
    primaryActionLabel = "승인 대기 보기";
    severity = "warning";
    blockedReason = "승인 대기";
  } else if (readyMailing.length) {
    primaryAction = "send_ready_mail";
    label = "발송 준비된 메일이 있습니다.";
    primaryActionLabel = "메일링함 열기";
    severity = "warning";
    blockedReason = "메일 발송 대기";
  } else {
    primaryAction = "advance_step";
    label = "이 단계는 완료 가능합니다.";
    primaryActionLabel = "다음 단계로 진행";
    severity = "success";
  }

  return {
    workflowRunId: run?.id,
    clientId: run?.client_id,
    currentStepKey: stepKey,
    currentStepName: STEP_NAME[stepKey] || stepKey,
    progress,
    label,
    primaryAction,
    primaryActionLabel,
    severity,
    canRun: primaryAction === "run_current_step",
    canApprove: primaryAction === "approve_required",
    canAdvance: primaryAction === "advance_step",
    canSendMail: primaryAction === "send_ready_mail",
    blockedReason,
    tasks: stepTasks,
    approvals: stepApprovals,
    mailing: stepMailing,
  };
}
