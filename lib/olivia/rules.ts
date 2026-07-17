import type { OliviaRuleCandidate, OliviaWorkflowContext } from "@/lib/olivia/types";

const HOUR = 60 * 60 * 1_000;
const DAY = 24 * HOUR;
const CUSTOMER_WAIT_DAYS: Record<string, number> = {
  quote: 3,
  contract: 2,
  conti: 2,
  client_selection: 3,
  final_delivery: 3,
  revision: 2,
};
const STALLED_DAYS: Record<string, number> = {
  consult_meeting: 3,
  quote: 5,
  contract: 4,
  conti: 4,
  shooting: 3,
  payment_confirm: 3,
  backup_sorting: 3,
  client_selection: 5,
  retouching: 7,
  final_delivery: 3,
  revision: 4,
  reward: 3,
};
const CLIENT_RESPONSE_EVENTS: Record<string, string[]> = {
  quote: ["client.quote_confirmed"],
  contract: ["client.contract_confirmed"],
  conti: ["client.conti_confirmed"],
  client_selection: ["client.selection_started", "client.selection_completed"],
  final_delivery: ["client.gallery_viewed", "client.review_submitted"],
  revision: ["client.revision_requested"],
};

const asTime = (value: unknown) => value ? new Date(String(value)).getTime() : 0;
const hoursSince = (value: unknown, now: number) => value ? (now - asTime(value)) / HOUR : 0;
const daysUntil = (value: unknown, now: number) => value ? Math.ceil((asTime(`${String(value).slice(0, 10)}T00:00:00+09:00`) - now) / DAY) : null;
const currentStepItems = (items: Record<string, any>[], stepKey: string) =>
  items.filter((item) => !item.workflow_step_key || item.workflow_step_key === stepKey);

function candidate(input: OliviaRuleCandidate): OliviaRuleCandidate {
  return input;
}

export function evaluateOliviaRules(context: OliviaWorkflowContext): OliviaRuleCandidate[] {
  const result: OliviaRuleCandidate[] = [];
  const run = context.workflowRun;
  const stepKey = String(run.current_step_key || "consult_meeting");
  const now = asTime(context.now);
  const clientName = run.client_name || "고객";

  for (const approval of context.approvals) {
    if (approval.status === "pending" && hoursSince(approval.created_at, now) >= 24) {
      result.push(candidate({
        ruleId: "RULE_01_APPROVAL_WAITING",
        insightType: "approval_waiting",
        title: `${approval.title || "승인 항목"} 확인이 필요합니다`,
        summary: `${clientName} 승인 요청이 24시간 이상 대기 중입니다.`,
        reason: `승인 요청 후 ${Math.floor(hoursSince(approval.created_at, now))}시간이 지났습니다.`,
        urgencyScore: 75, impactScore: 70, customerRiskScore: 55, revenueScore: 45, confidence: 1,
        deduplicationKey: `approval_waiting:${approval.id}`,
        recommendedAction: {
          actionType: "create_internal_reminder", title: "승인 항목 확인 알림", description: "대표 승인함에서 내용을 확인합니다.", permissionLevel: "auto",
          payload: { approvalId: approval.id },
        },
      }));
    }
  }

  for (const task of context.tasks) {
    if (task.status === "failed" && hoursSince(task.updated_at || task.created_at, now) >= 1) {
      result.push(candidate({
        ruleId: "RULE_02_FAILED_TASK",
        insightType: "risk",
        title: `${task.title || "자동화 작업"} 실패`,
        summary: `${clientName} 작업 실패가 1시간 이상 해결되지 않았습니다.`,
        reason: String(task.error_message || "실패 원인 확인 필요").slice(0, 500),
        urgencyScore: 95, impactScore: 85, customerRiskScore: 75, revenueScore: 55, confidence: 1,
        deduplicationKey: `failed_task:${task.id}:${task.retry_count ?? 0}`,
        recommendedAction: {
          actionType: "retry_failed_task", title: "실패 원인 확인 및 재실행", description: "오류를 검토한 뒤 대표 승인으로 재실행합니다.", permissionLevel: "review_required",
          payload: { taskId: task.id, retryCount: task.retry_count ?? 0 },
        },
      }));
    }
  }

  if (run.status === "active" && !String(run.next_action || "").trim()) {
    result.push(candidate({
      ruleId: "RULE_03_MISSING_NEXT_ACTION",
      insightType: "recommendation",
      title: `${clientName} 다음 행동이 비어 있습니다`,
      summary: `현재 ${context.currentStep?.name || stepKey} 단계의 다음 행동을 정해야 합니다.`,
      reason: "활성 워크플로우의 next_action 값이 비어 있습니다.",
      urgencyScore: 45, impactScore: 55, customerRiskScore: 35, revenueScore: 30, confidence: 0.85,
      deduplicationKey: `missing_next_action:${run.id}:${stepKey}`,
      recommendedAction: {
        actionType: "update_next_action", title: "다음 행동 추천 저장", description: `${context.currentStep?.name || stepKey} 단계 상태를 확인합니다.`, permissionLevel: "auto",
        payload: { nextAction: `${context.currentStep?.name || stepKey} 단계 상태 확인` },
      },
    }));
  }

  const waitDays = CUSTOMER_WAIT_DAYS[stepKey];
  if (waitDays) {
    const approved = currentStepItems(context.approvals, stepKey).some((item) => item.status === "approved");
    const publishedTimes = [
      ...currentStepItems(context.mailing, stepKey).filter((item) => ["ready", "sent"].includes(item.status)).map((item) => asTime(item.sent_at || item.updated_at || item.created_at)),
      ...context.recentEvents.filter((event) => event.event_type === `client.${stepKey}_viewed`).map((event) => asTime(event.occurred_at)),
    ].filter(Boolean);
    const publishedAt = publishedTimes.length ? Math.max(...publishedTimes) : 0;
    const responseTypes = CLIENT_RESPONSE_EVENTS[stepKey] || [];
    const responded = context.recentEvents.some((event) => responseTypes.includes(event.event_type) && asTime(event.occurred_at) > publishedAt);
    if (approved && publishedAt && !responded && now - publishedAt >= waitDays * DAY) {
      result.push(candidate({
        ruleId: "RULE_04_CUSTOMER_WAITING",
        insightType: "customer_waiting",
        title: `${clientName} 고객 응답을 확인해주세요`,
        summary: `${context.currentStep?.name || stepKey} 안내 후 ${waitDays}일 이상 응답이 없습니다.`,
        reason: "대표 승인과 고객 공개·발송 기록은 있으나 이후 고객 반응 사건이 없습니다.",
        urgencyScore: 70, impactScore: 65, customerRiskScore: 75, revenueScore: 50, confidence: 0.95,
        deduplicationKey: `customer_waiting:${run.id}:${stepKey}:${new Date(publishedAt).toISOString().slice(0, 10)}`,
        recommendedAction: {
          actionType: "create_followup_message", title: "고객 후속 연락 초안", description: `${clientName} 고객에게 보낼 확인 메시지를 준비합니다.`, permissionLevel: "review_required",
          payload: { stepKey, publishedAt: new Date(publishedAt).toISOString() },
        },
      }));
    }
  }

  const shootDday = daysUntil(run.shoot_date, now);
  if (shootDday !== null && shootDday >= 0 && shootDday <= 7) {
    const prep = run.preparation_data || {};
    const contractApproved = prep.contractApproved ?? context.approvals.some((item) => item.approval_type === "contract" && item.status === "approved");
    const contiApproved = prep.contiApproved ?? context.approvals.some((item) => item.approval_type === "conti" && item.status === "approved");
    const required: Record<string, boolean> = {
      contractApproved: Boolean(contractApproved),
      depositConfirmed: Boolean(prep.depositConfirmed),
      contiApproved: Boolean(contiApproved),
      contactPhone: Boolean(prep.contactPhone || context.client?.phone),
      location: Boolean(prep.location),
      medicalStaffCount: Number(prep.medicalStaffCount) > 0,
      hasModel: typeof prep.hasModel === "boolean",
      parkingInfo: Boolean(prep.parkingInfo),
      shootingTime: Boolean(prep.shootingTime),
      shootingItems: Array.isArray(prep.shootingItems) && prep.shootingItems.length > 0,
    };
    const missing = Object.entries(required).filter(([, ready]) => !ready).map(([key]) => key);
    if (missing.length) {
      const level = shootDday <= 1 ? 3 : shootDday <= 3 ? 2 : 1;
      result.push(candidate({
        ruleId: level === 3 ? "RULE_07_SHOOTING_D1" : level === 2 ? "RULE_06_SHOOTING_D3" : "RULE_05_SHOOTING_D7",
        insightType: "missing_data",
        title: `${clientName} 촬영 D-${shootDday} 준비 누락`,
        summary: `촬영 준비 항목 ${missing.length}개를 확인해야 합니다.`,
        reason: `누락 항목: ${missing.join(", ")}`,
        urgencyScore: level === 3 ? 100 : level === 2 ? 90 : 65,
        impactScore: level === 3 ? 100 : level === 2 ? 90 : 70,
        customerRiskScore: level === 3 ? 100 : level === 2 ? 90 : 70,
        revenueScore: 60,
        confidence: 1,
        deduplicationKey: `shooting_missing:${run.id}:${run.shoot_date}:${missing.sort().join("-")}`,
        recommendedDueAt: run.shoot_date ? `${run.shoot_date}T00:00:00+09:00` : null,
        recommendedAction: {
          actionType: level === 3 ? "create_followup_message" : "request_missing_information",
          title: level === 3 ? "촬영 전일 확인 메시지 초안" : "촬영 준비 정보 확인",
          description: `누락된 촬영 준비 항목을 확인합니다: ${missing.join(", ")}`,
          permissionLevel: "review_required",
          payload: { missingFields: missing, shootDate: run.shoot_date },
        },
      }));
    }
  }

  for (const commitment of context.commitments) {
    if (commitment.status !== "open" || !commitment.due_at) continue;
    const dueIn = asTime(commitment.due_at) - now;
    if (dueIn < 0) {
      result.push(candidate({
        ruleId: "RULE_09_COMMITMENT_OVERDUE",
        insightType: "commitment",
        title: `${commitment.owner_type === "client" ? "고객" : "대표"} 약속 기한이 지났습니다`,
        summary: String(commitment.commitment),
        reason: `약속 기한 ${commitment.due_at}이 경과했습니다.`,
        urgencyScore: 90, impactScore: 75, customerRiskScore: 80, revenueScore: 45, confidence: 1,
        deduplicationKey: `commitment_overdue:${commitment.id}`,
        recommendedAction: {
          actionType: commitment.owner_type === "client" ? "create_followup_message" : "create_agent_task",
          title: commitment.owner_type === "client" ? "고객 약속 후속 연락" : "대표 약속 처리",
          description: String(commitment.commitment),
          permissionLevel: commitment.owner_type === "client" ? "review_required" : "auto",
          payload: { commitmentId: commitment.id },
        },
      }));
    } else if (dueIn <= DAY) {
      result.push(candidate({
        ruleId: "RULE_08_COMMITMENT_DUE",
        insightType: "commitment",
        title: `${commitment.owner_type === "client" ? "고객" : "대표"} 약속 마감 임박`,
        summary: String(commitment.commitment),
        reason: "약속 기한이 24시간 이내입니다.",
        urgencyScore: 75, impactScore: 65, customerRiskScore: 65, revenueScore: 35, confidence: 1,
        deduplicationKey: `commitment_due:${commitment.id}`,
        recommendedDueAt: commitment.due_at,
        recommendedAction: {
          actionType: commitment.owner_type === "client" ? "create_followup_message" : "create_agent_task",
          title: commitment.owner_type === "client" ? "고객 약속 확인 초안" : "대표 약속 업무 생성",
          description: String(commitment.commitment),
          permissionLevel: commitment.owner_type === "client" ? "review_required" : "auto",
          dueAt: commitment.due_at,
          payload: { commitmentId: commitment.id },
        },
      }));
    }
  }

  const stalledDays = Number(context.currentStep?.expected_days || STALLED_DAYS[stepKey] || 4);
  if (run.status === "active" && hoursSince(run.updated_at || run.started_at, now) >= stalledDays * 24) {
    result.push(candidate({
      ruleId: "RULE_10_WORKFLOW_STALLED",
      insightType: "delay",
      title: `${clientName} 프로젝트가 정체되어 있습니다`,
      summary: `${context.currentStep?.name || stepKey} 단계에 ${stalledDays}일 이상 변화가 없습니다.`,
      reason: `마지막 변경: ${run.updated_at || run.started_at}`,
      urgencyScore: 70, impactScore: 70, customerRiskScore: 65, revenueScore: 55, confidence: 0.95,
      deduplicationKey: `workflow_stalled:${run.id}:${stepKey}`,
      recommendedAction: {
        actionType: "create_internal_reminder", title: "정체 원인 확인", description: "열린 업무와 승인, 고객 응답 상태를 확인합니다.", permissionLevel: "auto",
        payload: { workflowRunId: run.id, stepKey },
      },
    }));
  }

  const stepTasks = currentStepItems(context.tasks, stepKey);
  const stepApprovals = currentStepItems(context.approvals, stepKey);
  const hasOpenTask = stepTasks.some((item) => ["pending", "running", "waiting_approval", "failed"].includes(item.status));
  const hasOpenApproval = stepApprovals.some((item) => ["pending", "revision_requested"].includes(item.status));
  if (run.status === "active" && !hasOpenTask && !hasOpenApproval && hoursSince(run.updated_at || run.started_at, now) >= 12) {
    result.push(candidate({
      ruleId: "RULE_11_CAN_ADVANCE",
      insightType: "recommendation",
      title: `${clientName} 다음 단계 이동 가능`,
      summary: `${context.currentStep?.name || stepKey} 단계의 열린 업무와 승인이 없습니다.`,
      reason: "12시간 이상 단계 이동이 이루어지지 않았습니다.",
      urgencyScore: 55, impactScore: 65, customerRiskScore: 45, revenueScore: 40, confidence: 0.95,
      deduplicationKey: `can_advance:${run.id}:${stepKey}`,
      recommendedAction: {
        actionType: "advance_workflow", title: "다음 단계 이동 승인", description: "대표 승인 후 기존 워크플로우 전환 함수를 실행합니다.", permissionLevel: "review_required",
        payload: { workflowRunId: run.id, fromStepKey: stepKey },
      },
    }));
  }

  for (const mail of context.mailing) {
    if (mail.status === "ready" && hoursSince(mail.updated_at || mail.created_at, now) >= 12) {
      result.push(candidate({
        ruleId: "RULE_12_READY_MAIL_WAITING",
        insightType: "delay",
        title: `${clientName} 발송 준비 메일 대기`,
        summary: `${mail.subject || "메일"}이 12시간 이상 발송되지 않았습니다.`,
        reason: "mailing_queue.status가 ready 상태로 유지되고 있습니다.",
        urgencyScore: 65, impactScore: 60, customerRiskScore: 65, revenueScore: 35, confidence: 1,
        deduplicationKey: `ready_mail_waiting:${mail.id}`,
        recommendedAction: {
          actionType: "create_mailing_draft", title: "발송 준비 메일 확인", description: "메일 내용을 확인한 뒤 대표가 발송합니다.", permissionLevel: "review_required",
          payload: { mailingId: mail.id },
        },
      }));
    }
  }

  if (stepKey === "retouching") {
    const progress = run.work_progress?.retouching || {};
    const total = Number(progress.total || 0);
    const completed = Number(progress.completed || 0);
    const dueAt = asTime(progress.dueAt);
    if (total > completed && dueAt && dueAt - now <= 2 * DAY) {
      result.push(candidate({
        ruleId: "RULE_13_RETOUCHING_RISK",
        insightType: "risk",
        title: `${clientName} 보정 납기 위험`,
        summary: `${total}장 중 ${completed}장 완료, 납기가 임박했습니다.`,
        reason: `남은 ${Math.max(total - completed, 0)}장을 ${progress.dueAt}까지 완료해야 합니다.`,
        urgencyScore: dueAt < now ? 95 : 80, impactScore: 85, customerRiskScore: 85, revenueScore: 55, confidence: 1,
        deduplicationKey: `retouching_risk:${run.id}:${progress.dueAt}:${completed}`,
        recommendedDueAt: progress.dueAt,
        recommendedAction: {
          actionType: "create_agent_task", title: "보정 납기 대응 업무", description: "남은 보정 수량과 담당 일정을 확인합니다.", permissionLevel: "auto",
          dueAt: progress.dueAt, payload: { total, completed },
        },
      }));
    }
  }

  const unresolvedRevisions = context.revisions.some((item) => ["requested", "in_progress"].includes(item.status));
  if (run.status === "active" && stepKey === "reward" && !hasOpenTask && !hasOpenApproval && !unresolvedRevisions) {
    result.push(candidate({
      ruleId: "RULE_14_PROJECT_COMPLETABLE",
      insightType: "opportunity",
      title: `${clientName} 프로젝트 완료 가능`,
      summary: "미완료 업무·승인·수정 요청이 없습니다.",
      reason: "현재 리워드 단계이며 열린 차단 항목이 없습니다.",
      urgencyScore: 45, impactScore: 65, customerRiskScore: 30, revenueScore: 40, confidence: 0.9,
      deduplicationKey: `project_completable:${run.id}`,
      recommendedAction: {
        actionType: "advance_workflow", title: "프로젝트 완료 승인", description: "대표 승인 후 프로젝트를 완료 처리합니다.", permissionLevel: "review_required",
        payload: { workflowRunId: run.id, fromStepKey: stepKey },
      },
    }));
  }

  for (const review of context.reviews) {
    if (Number(review.overall_rating || 0) >= 4 && review.allow_public_use === true) {
      result.push(candidate({
        ruleId: "RULE_15_REVIEW_OPPORTUNITY",
        insightType: "marketing",
        title: `${clientName} 후기를 콘텐츠로 활용할 수 있습니다`,
        summary: String(review.public_review_text || review.good_points || "긍정적인 고객 후기가 등록되었습니다.").slice(0, 500),
        reason: "평점 4점 이상이며 공개 활용에 동의한 후기입니다.",
        urgencyScore: 35, impactScore: 60, customerRiskScore: 10, revenueScore: 45, confidence: 1,
        deduplicationKey: `review_opportunity:${review.id}`,
        recommendedAction: {
          actionType: "create_marketing_content_draft", title: "후기 콘텐츠 초안 준비", description: "블로그·인스타·홈페이지 사례 후보를 만듭니다.", permissionLevel: "review_required",
          payload: { reviewId: review.id, allowPublicUse: true },
        },
      }));
    }
  }

  return result;
}
