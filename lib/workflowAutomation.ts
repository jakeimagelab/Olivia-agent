import { SupabaseClient } from "@supabase/supabase-js";
import {
  ACTIVE_WORKFLOW_STEP_KEYS,
  LEGACY_NEXT_STEP,
  STEP_NAME,
  isActiveWorkflowStep,
} from "@/lib/workflow";
import { addYearsIso } from "@/lib/dataRetention";
import { createEventDeduplicationKey, emitOliviaEventSafely } from "@/lib/olivia/events";
import { loadWorkflowRegisteredData, workflowContact, type WorkflowRegisteredData } from "@/lib/workflowDataContext";
import { addPoints } from "@/lib/per";

export type StepAutomation = {
  task_type: string;
  title: string;
  description: string;
  requires_approval: boolean;
  creates_mailing_draft: boolean;
  approval_type?: "quote" | "contract" | "conti" | "mailing" | "content" | "per" | "other";
  mailing_type?: "quote" | "contract" | "conti" | "proposal" | "original_files" | "gallery" | "review_form" | "monthly_report";
  priority?: "low" | "normal" | "high" | "urgent";
};

export const STEP_AUTOMATIONS: Record<string, StepAutomation[]> = {
  consult_meeting: [
    {
      task_type: "client_brief_prepare",
      title: "상담 메모 정리",
      description: "상담 내용과 병원 정보를 워크플로우 입력값으로 정리합니다.",
      requires_approval: false,
      creates_mailing_draft: false,
    },
  ],
  quote: [
    {
      task_type: "quote_draft",
      title: "견적서 초안 생성",
      description: "상담 메모와 촬영 정보를 바탕으로 견적 초안을 만듭니다.",
      requires_approval: true,
      creates_mailing_draft: false,
      approval_type: "quote",
      priority: "high",
    },
    {
      task_type: "quote_mailing_draft",
      title: "견적 안내 메일 초안 생성",
      description: "견적서를 안내하는 메일 초안을 메일링함에 저장합니다.",
      requires_approval: true,
      creates_mailing_draft: true,
      approval_type: "mailing",
      mailing_type: "quote",
      priority: "high",
    },
  ],
  contract: [
    {
      task_type: "contract_draft",
      title: "계약서 초안 생성",
      description: "확정된 견적 정보를 바탕으로 계약서 초안을 만듭니다.",
      requires_approval: true,
      creates_mailing_draft: false,
      approval_type: "contract",
      priority: "high",
    },
    {
      task_type: "contract_mailing_draft",
      title: "계약 안내 메일 초안 생성",
      description: "계약서 확인 안내 메일 초안을 메일링함에 저장합니다.",
      requires_approval: true,
      creates_mailing_draft: true,
      approval_type: "mailing",
      mailing_type: "contract",
      priority: "high",
    },
  ],
  conti: [
    {
      task_type: "conti_draft",
      title: "촬영 콘티 초안 생성",
      description: "촬영 목적, 장면, 동선을 기준으로 콘티 초안을 만듭니다.",
      requires_approval: true,
      creates_mailing_draft: false,
      approval_type: "conti",
      priority: "high",
    },
    {
      task_type: "conti_mailing_draft",
      title: "콘티 확인 메일 초안 생성",
      description: "콘티 확인 요청 메일 초안을 메일링함에 저장합니다.",
      requires_approval: true,
      creates_mailing_draft: true,
      approval_type: "mailing",
      mailing_type: "conti",
    },
  ],
  shooting: [
    {
      task_type: "shooting_reminder",
      title: "촬영 리마인드 메일 초안 생성",
      description: "촬영 D-7/D-3/D-1 안내용 리마인드 초안을 생성합니다.",
      requires_approval: true,
      creates_mailing_draft: true,
      approval_type: "mailing",
      mailing_type: "proposal",
    },
  ],
  // 대표가 입금 및 계산서 처리를 확인한 뒤 수동으로 다음 단계로 진행한다.
  payment_confirm: [],
  backup_sorting: [
    {
      task_type: "backup_sorting_check",
      title: "촬영 데이터 백업 및 분류 확인",
      description: "촬영본 백업과 JPG/RAW 분류 상태를 확인합니다.",
      requires_approval: false,
      creates_mailing_draft: false,
      priority: "high",
    },
  ],
  original_delivery: [
    {
      task_type: "original_delivery",
      title: "원본 전달 메일 초안 생성",
      description: "NAS 원본 링크를 포함한 원본 전달 메일 초안을 생성합니다.",
      requires_approval: true,
      creates_mailing_draft: true,
      approval_type: "mailing",
      mailing_type: "original_files",
    },
  ],
  client_selection: [
    {
      task_type: "original_delivery",
      title: "원본 전달 메일 초안 생성",
      description: "NAS 원본 링크를 포함한 원본 전달 메일 초안을 생성합니다.",
      requires_approval: true,
      creates_mailing_draft: true,
      approval_type: "mailing",
      mailing_type: "original_files",
    },
    {
      task_type: "selection_gallery_prepare",
      title: "고객 셀렉 갤러리 준비",
      description: "분류된 JPG를 고객 셀렉 갤러리와 연결합니다.",
      requires_approval: false,
      creates_mailing_draft: false,
    },
    {
      task_type: "raw_matching",
      title: "선택 사진 RAW 자동 매칭",
      description: "고객이 선택한 JPG와 원본 RAW 파일을 매칭합니다.",
      requires_approval: true,
      creates_mailing_draft: false,
      approval_type: "other",
      priority: "high",
    },
  ],
  retouching: [],
  revision: [
    {
      task_type: "revision_review",
      title: "수정 요청 검토",
      description: "고객 수정 요청을 유형별로 정리하고 우선순위를 지정합니다.",
      requires_approval: false,
      creates_mailing_draft: false,
      priority: "high",
    },
    {
      task_type: "review_summarize",
      title: "후기 요약 및 콘텐츠 후보 생성",
      description: "후기를 요약하고 공개 가능한 SNS 콘텐츠 후보를 생성합니다.",
      requires_approval: true,
      creates_mailing_draft: false,
      approval_type: "content",
    },
  ],
  final_delivery: [
    {
      task_type: "seo_delivery_prepare",
      title: "AI 검색 최적화 납품 생성",
      description: "최종 이미지와 프로젝트 정보를 바탕으로 검색 최적화 납품 자료를 준비합니다.",
      requires_approval: true,
      creates_mailing_draft: false,
      approval_type: "other",
      priority: "high",
    },
    {
      task_type: "gallery_delivery_mailing_draft",
      title: "최종 갤러리 전달 메일 초안 생성",
      description: "최종 파일/NAS 링크와 리뷰 링크를 포함한 전달 메일 초안입니다.",
      requires_approval: true,
      creates_mailing_draft: true,
      approval_type: "mailing",
      mailing_type: "gallery",
      priority: "urgent",
    },
    {
      task_type: "review_request_mailing_draft",
      title: "리뷰 요청 메일 초안 생성",
      description: "고객 포털 리뷰 링크를 포함한 리뷰 요청 메일 초안입니다.",
      requires_approval: true,
      creates_mailing_draft: true,
      approval_type: "mailing",
      mailing_type: "review_form",
      priority: "high",
    },
  ],
  review_content: [
    {
      task_type: "review_summarize",
      title: "리뷰 요약 및 콘텐츠 후보 생성",
      description: "리뷰를 요약하고 공개 가능한 SNS 콘텐츠 후보를 생성합니다.",
      requires_approval: true,
      creates_mailing_draft: false,
      approval_type: "content",
    },
  ],
  reward: [
    {
      task_type: "per_points_calculate",
      title: "PER 포인트 적립 계산",
      description: "촬영 금액 기준 1% PER 포인트를 계산합니다.",
      requires_approval: false,
      creates_mailing_draft: false,
      approval_type: "per",
    },
    {
      task_type: "per_notice_mailing_draft",
      title: "PER 포인트 적립 안내 메일 초안 생성",
      description: "PER 적립 안내 메일 초안을 메일링함에 저장합니다.",
      requires_approval: true,
      creates_mailing_draft: true,
      approval_type: "mailing",
      mailing_type: "proposal",
    },
  ],
};

export function getNextWorkflowStep(stepKey: string) {
  if (Object.prototype.hasOwnProperty.call(LEGACY_NEXT_STEP, stepKey)) {
    return LEGACY_NEXT_STEP[stepKey];
  }
  if (!isActiveWorkflowStep(stepKey)) return null;
  const currentIndex = ACTIVE_WORKFLOW_STEP_KEYS.indexOf(stepKey);
  return ACTIVE_WORKFLOW_STEP_KEYS[currentIndex + 1] ?? null;
}

export async function logAgent(db: SupabaseClient, input: {
  workflow_run_id?: string | null;
  agent_task_id?: string | null;
  log_type: string;
  message: string;
  input_summary?: string;
  output_summary?: string;
  success?: boolean;
  error_message?: string;
}) {
  await db.from("agent_logs").insert({
    workflow_run_id: input.workflow_run_id ?? null,
    agent_task_id: input.agent_task_id ?? null,
    log_type: input.log_type,
    message: input.message,
    input_summary: input.input_summary ?? "",
    output_summary: input.output_summary ?? "",
    success: input.success ?? true,
    error_message: input.error_message ?? "",
  });
}

export async function getWorkflowRun(db: SupabaseClient, workflowRunId: string) {
  const { data, error } = await db.from("workflow_runs").select("*").eq("id", workflowRunId).single();
  if (error || !data) throw new Error(error?.message ?? "workflow_run not found");
  return data;
}

export async function ensureStepRun(db: SupabaseClient, workflowRunId: string, stepKey: string, status = "in_progress") {
  const { data: existing } = await db
    .from("workflow_step_runs")
    .select("*")
    .eq("workflow_run_id", workflowRunId)
    .eq("step_key", stepKey)
    .maybeSingle();

  if (existing) {
    if (existing.status === "completed") return existing;
    const { data, error } = await db
      .from("workflow_step_runs")
      .update({ status, started_at: existing.started_at ?? new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("id", existing.id)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data;
  }

  const { data, error } = await db
    .from("workflow_step_runs")
    .insert({
      workflow_run_id: workflowRunId,
      step_key: stepKey,
      status,
      started_at: new Date().toISOString(),
    })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function createStepTasks(db: SupabaseClient, workflowRunId: string, stepKey: string) {
  const run = await getWorkflowRun(db, workflowRunId);
  const registeredData = await loadWorkflowRegisteredData(db, run);
  const stepRun = await ensureStepRun(db, workflowRunId, stepKey, "in_progress");
  if (stepRun.status === "completed") return { created: [], skipped: true };

  const automations = STEP_AUTOMATIONS[stepKey] ?? [];
  const created = [];

  for (const automation of automations) {
    const { data: existing, error: existingError } = await db
      .from("agent_tasks")
      .select("id")
      .eq("workflow_run_id", workflowRunId)
      .eq("workflow_step_key", stepKey)
      .eq("task_type", automation.task_type)
      .limit(1);
    if (existingError) throw new Error(existingError.message);
    if (existing?.length) continue;

    const { data, error } = await db
      .from("agent_tasks")
      .insert({
        client_id: run.client_id ?? null,
        project_id: run.project_id ?? null,
        workflow_run_id: workflowRunId,
        workflow_step_run_id: stepRun.id,
        workflow_step_key: stepKey,
        workflow_step_name: STEP_NAME[stepKey] || stepKey,
        client_name: run.client_name ?? "",
        project_name: run.project_name ?? "",
        task_type: automation.task_type,
        title: automation.title,
        description: automation.description,
        priority: automation.priority ?? "normal",
        status: "pending",
        input_data: {
          workflow_step_key: stepKey,
          client_name: run.client_name,
          project_name: run.project_name,
          manager_name: run.manager_name,
          shoot_date: run.shoot_date,
          registered_data: registeredData,
          automation,
        },
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    created.push(data);
    await emitOliviaEventSafely(db, {
      eventType: "agent.task_created",
      eventSource: "workflow_automation",
      clientId: run.client_id ?? null,
      projectId: run.project_id ?? null,
      workflowRunId,
      payload: { taskId: data.id, taskType: data.task_type, stepKey },
      deduplicationKey: createEventDeduplicationKey("agent.task_created", data.id),
    });
  }

  await logAgent(db, {
    workflow_run_id: workflowRunId,
    log_type: "step_tasks_created",
    message: `${STEP_NAME[stepKey] || stepKey} 단계 자동 작업 ${created.length}개 생성`,
    output_summary: created.map((task) => task.task_type).join(", "),
  });

  return { created, skipped: false };
}

export async function advanceWorkflow(db: SupabaseClient, input: { workflow_run_id: string; to_step_key?: string | null; from_step_key?: string | null; reason?: string }) {
  const run = await getWorkflowRun(db, input.workflow_run_id);
  const fromStep = run.current_step_key;

  // from_step_key 가드: 현재 단계가 지정한 단계와 다르면 건너뜀 (중복 전진 방지)
  if (input.from_step_key && fromStep !== input.from_step_key) {
    return { skipped: true, reason: `current step is ${fromStep}, expected ${input.from_step_key}`, from_step_key: fromStep, to_step_key: null, created: [] };
  }

  const toStep = input.to_step_key || getNextWorkflowStep(fromStep);
  if (toStep && !STEP_NAME[toStep]) {
    throw new Error(`정의되지 않은 워크플로우 단계입니다: ${toStep}`);
  }
  const now = new Date().toISOString();
  if (!toStep) {
    await db.from("workflow_runs").update({ status: "completed", completed_at: now, updated_at: now }).eq("id", run.id);
    await logAgent(db, { workflow_run_id: run.id, log_type: "workflow_completed", message: `${run.client_name || "워크플로우"} 전체 단계가 완료되었습니다.` });
    await emitOliviaEventSafely(db, {
      eventType: "workflow.completed",
      eventSource: "workflow_automation",
      clientId: run.client_id ?? null,
      projectId: run.project_id ?? null,
      workflowRunId: run.id,
      payload: { fromStepKey: fromStep, reason: input.reason ?? "" },
      deduplicationKey: createEventDeduplicationKey("workflow.completed", run.id),
    });
    return { completed: true, from_step_key: fromStep, to_step_key: null, created: [] };
  }

  await db
    .from("workflow_step_runs")
    .update({ status: "completed", completed_at: now, updated_at: now })
    .eq("workflow_run_id", run.id)
    .eq("step_key", fromStep)
    .neq("status", "completed");

  const { error } = await db
    .from("workflow_runs")
    .update({
      current_step_key: toStep,
      next_action: buildNextAction(toStep),
      updated_at: now,
    })
    .eq("id", run.id);
  if (error) throw new Error(error.message);

  // 자동 전진·수동 전진 어느 경로에서든 동일하게 보관 기한을 기록한다.
  // 마이그레이션 전 DB에서는 업데이트 오류를 무시해 기존 워크플로우를 보호한다.
  if (fromStep === "client_selection" && toStep === "retouching") {
    await db.from("workflow_runs").update({
      original_delivered_at: now,
      original_expires_at: addYearsIso(new Date(now), 1),
    }).eq("id", run.id);
  }
  if (fromStep === "final_delivery" && toStep === "revision") {
    await db.from("workflow_runs").update({
      retouched_delivered_at: now,
      retouched_expires_at: addYearsIso(new Date(now), 3),
    }).eq("id", run.id);
  }

  await ensureStepRun(db, run.id, toStep, "in_progress");
  const taskResult = await createStepTasks(db, run.id, toStep);

  await logAgent(db, {
    workflow_run_id: run.id,
    log_type: "step_advanced",
    message: `${STEP_NAME[fromStep] || fromStep} → ${STEP_NAME[toStep] || toStep} 단계로 이동했습니다.`,
    input_summary: input.reason ?? "",
    output_summary: `created_tasks: ${taskResult.created.length}`,
  });

  await emitOliviaEventSafely(db, {
    eventType: "workflow.step_changed",
    eventSource: "workflow_automation",
    clientId: run.client_id ?? null,
    projectId: run.project_id ?? null,
    workflowRunId: run.id,
    payload: {
      fromStepKey: fromStep,
      toStepKey: toStep,
      reason: input.reason ?? "",
      previousNextAction: run.next_action ?? "",
      newNextAction: buildNextAction(toStep),
    },
    deduplicationKey: createEventDeduplicationKey("workflow.step_changed", run.id, fromStep, toStep),
  });

  return { completed: false, from_step_key: fromStep, to_step_key: toStep, created: taskResult.created };
}

/**
 * 이미 실제로는 끝난 프로젝트를 뒤늦게 시스템에 등록하면서 한 번에 완료 처리한다.
 * 정상 진행(advanceWorkflow)과 달리 각 단계의 "다음 할 일"을 새로 만들지 않고,
 * 오히려 남아있는 미완료 단계/업무를 전부 정리하고 워크플로우를 completed로 마감한다.
 */
export async function completeWorkflowRetroactively(
  db: SupabaseClient,
  input: { workflow_run_id: string; reason?: string },
) {
  const run = await getWorkflowRun(db, input.workflow_run_id);
  const now = new Date().toISOString();
  // WORKFLOW_STEPS(전체 18단계 카탈로그)의 마지막 원소는 배열 선언 순서상 우연히 payment_confirm이라
  // "진행 6/12"처럼 UI 진행률 계산(ACTIVE_WORKFLOW_STEP_KEYS 기준)과 어긋나는 버그가 있었다.
  // 진행률·칸반·상세페이지가 전부 ACTIVE_WORKFLOW_STEP_KEYS를 기준으로 계산하므로 그 마지막 값을 써야 한다.
  const lastStepKey = ACTIVE_WORKFLOW_STEP_KEYS[ACTIVE_WORKFLOW_STEP_KEYS.length - 1];

  // 1) 안 끝난 단계(step_runs) 전부 완료 처리
  await db.from("workflow_step_runs")
    .update({ status: "completed", completed_at: now, updated_at: now })
    .eq("workflow_run_id", run.id)
    .neq("status", "completed");

  // 2) 안 끝난 업무(agent_tasks) 전부 정리 (완료가 아니라 "소급등록으로 생략"으로 명확히 구분)
  await db.from("agent_tasks")
    .update({ status: "canceled", error_message: "소급 등록으로 인해 생략됨", completed_at: now, updated_at: now })
    .eq("workflow_run_id", run.id)
    .in("status", ["pending", "running", "waiting_approval"]);

  // 3) 워크플로우 본체를 마지막 단계로 옮기고 completed 처리
  await db.from("workflow_runs")
    .update({
      current_step_key: lastStepKey,
      status: "completed",
      completed_at: now,
      updated_at: now,
    })
    .eq("id", run.id);

  await logAgent(db, {
    workflow_run_id: run.id,
    log_type: "workflow_completed",
    message: `${run.client_name || "워크플로우"} — 소급 등록 후 전체 완료 처리됨.`,
    input_summary: input.reason ?? "",
  });

  await emitOliviaEventSafely(db, {
    eventType: "workflow.completed",
    eventSource: "workflow_retroactive_completion",
    clientId: run.client_id ?? null,
    projectId: run.project_id ?? null,
    workflowRunId: run.id,
    payload: { reason: input.reason ?? "", retroactive: true },
    deduplicationKey: createEventDeduplicationKey("workflow.completed", run.id, "retroactive"),
  });

  return { completed: true, workflow_run_id: run.id, final_step_key: lastStepKey };
}

export async function maybeAdvanceWorkflow(db: SupabaseClient, workflowRunId: string, stepKey: string) {
  const [tasksRes, approvalsRes] = await Promise.all([
    db.from("agent_tasks").select("*").eq("workflow_run_id", workflowRunId).eq("workflow_step_key", stepKey),
    db.from("agent_approvals").select("*").eq("workflow_run_id", workflowRunId).eq("workflow_step_key", stepKey),
  ]);
  if (tasksRes.error) throw new Error(tasksRes.error.message);
  if (approvalsRes.error) throw new Error(approvalsRes.error.message);

  const tasks = tasksRes.data ?? [];
  const approvals = approvalsRes.data ?? [];
  const hasOpenTask = tasks.some((task) => ["pending", "running", "waiting_approval", "failed"].includes(task.status));
  const hasPendingApproval = approvals.some((approval) => approval.status === "pending" || approval.status === "revision_requested");
  if (hasOpenTask || hasPendingApproval) return { advanced: false as const, reason: "open_items" };

  const result = await advanceWorkflow(db, {
    workflow_run_id: workflowRunId,
    from_step_key: stepKey,
    reason: "required tasks and approvals completed",
  });
  if (result.skipped) return { advanced: false as const, reason: "current_step_changed", result };
  return { advanced: true as const, result };
}

export async function executeWorkflowTask(db: SupabaseClient, taskId: string) {
  const { data: task, error: taskError } = await db.from("agent_tasks").select("*").eq("id", taskId).single();
  if (taskError || !task) throw new Error(taskError?.message ?? "task not found");

  const automation = findAutomation(task.workflow_step_key, task.task_type);
  const run = task.workflow_run_id ? await getWorkflowRun(db, task.workflow_run_id) : null;
  const registeredData = run
    ? await loadWorkflowRegisteredData(db, run)
    : (task.input_data?.registered_data ?? null);
  const now = new Date().toISOString();

  await db.from("agent_tasks").update({ status: "running", started_at: task.started_at ?? now, updated_at: now, error_message: "" }).eq("id", task.id);
  await emitOliviaEventSafely(db, {
    eventType: "agent.task_started",
    eventSource: "workflow_automation",
    clientId: task.client_id ?? run?.client_id ?? null,
    projectId: task.project_id ?? run?.project_id ?? null,
    workflowRunId: task.workflow_run_id ?? null,
    payload: { taskId: task.id, taskType: task.task_type, retryCount: task.retry_count ?? 0 },
    deduplicationKey: createEventDeduplicationKey("agent.task_started", task.id, task.retry_count ?? 0),
  });

  try {
    const enrichedTask = {
      ...task,
      input_data: { ...(task.input_data ?? {}), registered_data: registeredData },
    };
    if (registeredData) {
      await db.from("agent_tasks").update({ input_data: enrichedTask.input_data, updated_at: now }).eq("id", task.id);
    }
    const output = await buildTaskOutput(db, enrichedTask, run);
    let relatedType = task.task_type;
    let relatedId = `${task.task_type}-${task.id}`;
    let mailingId: string | null = null;

    if (automation?.creates_mailing_draft) {
      const mailing = await ensureMailingDraft(db, enrichedTask, run, automation, output);
      mailingId = mailing.id;
      relatedType = "mailing_queue";
      relatedId = mailing.id;
    }

    if (automation?.requires_approval) {
      const approval = await ensureApproval(db, enrichedTask, run, automation, output, relatedType, relatedId);
      if (mailingId) {
        await db.from("mailing_queue").update({ source_id: task.id, approval_id: approval.id, approval_status: "pending" }).eq("id", mailingId);
      }
      const { data, error } = await db
        .from("agent_tasks")
        .update({ status: "waiting_approval", output_data: output, updated_at: now })
        .eq("id", task.id)
        .select()
        .single();
      if (error) throw new Error(error.message);
      await logAgent(db, { workflow_run_id: task.workflow_run_id, agent_task_id: task.id, log_type: "approval_requested", message: `${task.title} 승인 요청이 생성되었습니다.`, output_summary: approval.title });
      await emitOliviaEventSafely(db, {
        eventType: "approval.requested",
        eventSource: "workflow_automation",
        clientId: task.client_id ?? run?.client_id ?? null,
        projectId: task.project_id ?? run?.project_id ?? null,
        workflowRunId: task.workflow_run_id ?? null,
        payload: { approvalId: approval.id, taskId: task.id, approvalType: approval.approval_type },
        deduplicationKey: createEventDeduplicationKey("approval.requested", approval.id),
      });
      return { task: data, approval, output };
    }

    if (task.task_type === "per_points_calculate") {
      await ensureRewardTransaction(db, enrichedTask, run, output);
    }

    const { data, error } = await db
      .from("agent_tasks")
      .update({ status: "completed", output_data: output, completed_at: now, updated_at: now })
      .eq("id", task.id)
      .select()
      .single();
    if (error) throw new Error(error.message);

    await logAgent(db, { workflow_run_id: task.workflow_run_id, agent_task_id: task.id, log_type: "task_completed", message: `${task.title} 작업이 완료되었습니다.`, output_summary: JSON.stringify(output).slice(0, 300) });
    await emitOliviaEventSafely(db, {
      eventType: "agent.task_completed",
      eventSource: "workflow_automation",
      clientId: task.client_id ?? run?.client_id ?? null,
      projectId: task.project_id ?? run?.project_id ?? null,
      workflowRunId: task.workflow_run_id ?? null,
      payload: { taskId: task.id, taskType: task.task_type, retryCount: task.retry_count ?? 0 },
      deduplicationKey: createEventDeduplicationKey("agent.task_completed", task.id, task.retry_count ?? 0),
    });
    if (task.workflow_run_id && task.workflow_step_key) await maybeAdvanceWorkflow(db, task.workflow_run_id, task.workflow_step_key);
    return { task: data, output };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await db.from("agent_tasks").update({ status: "failed", error_message: message, updated_at: new Date().toISOString() }).eq("id", task.id);
    await logAgent(db, { workflow_run_id: task.workflow_run_id, agent_task_id: task.id, log_type: "task_failed", message: `${task.title} 작업 실패`, success: false, error_message: message });
    await emitOliviaEventSafely(db, {
      eventType: "agent.task_failed",
      eventSource: "workflow_automation",
      clientId: task.client_id ?? run?.client_id ?? null,
      projectId: task.project_id ?? run?.project_id ?? null,
      workflowRunId: task.workflow_run_id ?? null,
      payload: { taskId: task.id, taskType: task.task_type, errorMessage: message.slice(0, 1_000), retryCount: task.retry_count ?? 0 },
      deduplicationKey: createEventDeduplicationKey("agent.task_failed", task.id, task.retry_count ?? 0),
    });
    throw error;
  }
}

export async function approveWorkflowItem(db: SupabaseClient, approvalId: string, memo = "") {
  const now = new Date().toISOString();
  const { data: approval, error } = await db
    .from("agent_approvals")
    .update({ status: "approved", admin_memo: memo, approved_at: now, updated_at: now })
    .eq("id", approvalId)
    .select()
    .single();
  if (error) throw new Error(error.message);

  if (approval.agent_task_id) {
    await db.from("agent_tasks").update({ status: "completed", completed_at: now, updated_at: now }).eq("id", approval.agent_task_id);
  }

  if (approval.related_type === "mailing_queue" && approval.related_id) {
    await db.from("mailing_queue").update({ status: "ready", approval_status: "approved", updated_at: now }).eq("id", approval.related_id);
  }
  if (approval.related_type === "olivia_action" && approval.related_id) {
    await db.from("olivia_actions").update({ status: "approved", updated_at: now }).eq("id", approval.related_id);
    await db.from("olivia_feedback").insert({
      action_id: approval.related_id,
      feedback_type: "approved",
      original_content: approval.preview_data ?? {},
    });
  }

  // 고객 수정본 재제출 뒤 최종 승인된 요청을 닫는다. 마이그레이션 전 DB에서는
  // 테이블에 새 컬럼이 없어도 기존 승인 동작을 막지 않도록 결과를 의도적으로 무시한다.
  await db
    .from("client_revision_requests")
    .update({ status: "completed", updated_at: now })
    .eq("approval_id", approval.id)
    .eq("status", "in_progress");

  await logAgent(db, {
    workflow_run_id: approval.workflow_run_id,
    agent_task_id: approval.agent_task_id,
    log_type: "approval_approved",
    message: `${approval.title} 항목이 승인되었습니다.`,
    output_summary: `${approval.related_type}:${approval.related_id}`,
  });

  await emitOliviaEventSafely(db, {
    eventType: "approval.approved",
    eventSource: "workflow_automation",
    clientId: approval.client_id ?? null,
    projectId: approval.project_id ?? null,
    workflowRunId: approval.workflow_run_id ?? null,
    actorType: "admin",
    payload: { approvalId: approval.id, approvalType: approval.approval_type, taskId: approval.agent_task_id },
    deduplicationKey: createEventDeduplicationKey("approval.approved", approval.id),
  });

  if (approval.workflow_run_id && approval.workflow_step_key) {
    await maybeAdvanceWorkflow(db, approval.workflow_run_id, approval.workflow_step_key);
  }

  return approval;
}

export function buildNextAction(stepKey: string) {
  const automations = STEP_AUTOMATIONS[stepKey] ?? [];
  if (automations.length) return automations.map((item) => item.title).join(" / ");
  return `${STEP_NAME[stepKey] || stepKey} 단계 확인`;
}

function findAutomation(stepKey: string | null, taskType: string): StepAutomation | undefined {
  if (stepKey && STEP_AUTOMATIONS[stepKey]) return STEP_AUTOMATIONS[stepKey].find((item) => item.task_type === taskType);
  return Object.values(STEP_AUTOMATIONS).flat().find((item) => item.task_type === taskType);
}

function approvalTypeFromTask(taskType: string): StepAutomation["approval_type"] {
  if (taskType.startsWith("quote")) return "quote";
  if (taskType.startsWith("contract")) return "contract";
  if (taskType.startsWith("conti")) return "conti";
  if (taskType.includes("per")) return "per";
  if (taskType.includes("review_summarize")) return "content";
  if (taskType.includes("mailing") || taskType.includes("delivery") || taskType.includes("reminder")) return "mailing";
  return "other";
}

async function buildTaskOutput(db: SupabaseClient, task: any, run: any) {
  const registered = (task.input_data?.registered_data ?? {}) as WorkflowRegisteredData;
  const contact = workflowContact(registered, run ?? task);
  const hospitalName = contact.hospitalName;
  const projectName = run?.project_name || task.project_name || "촬영 프로젝트";
  const consultation = registered.consultation ?? {};
  const extracted = consultation.extracted_data ?? {};
  const quote = registered.quote ?? {};
  const contractQuote = registered.contract?.quote_data ?? {};
  const shootDate = run?.shoot_date || registered.project?.shoot_date || quote.shoot_date || registered.gallery?.shoot_date || task.input_data?.shoot_date || "";
  const amount = Number(quote.total_amount || contractQuote.totalAmount || contractQuote.total_amount || task.input_data?.amount || task.input_data?.total_amount || 2200000);
  const supply = Math.round(amount / 1.1);
  const quoteItems = Array.isArray(quote.items) ? quote.items : Array.isArray(contractQuote.items) ? contractQuote.items : [];
  const shootingItems = Array.isArray(extracted.shooting_items)
    ? extracted.shooting_items
    : Array.isArray(extracted.shootingItems)
      ? extracted.shootingItems
      : quoteItems.map((item: any) => item.name).filter(Boolean);

  if (task.task_type === "quote_draft") {
    return {
      quote_number: quote.quote_number ?? null,
      package_name: consultation.recommended_package || quote.title || projectName || "포토클리닉 촬영 패키지",
      base_amount: Number(quote.supply_amount || supply),
      options: quoteItems.length ? quoteItems : shootingItems,
      discount: Number(quote.discount_amount || 0),
      vat: Number(quote.vat || amount - supply),
      total_amount: amount,
      memo: consultation.summary || `${hospitalName}에 등록된 고객·프로젝트 정보를 기준으로 생성한 견적 초안입니다.`,
      source: quote.id ? "registered_quote" : consultation.id ? "registered_consultation" : "workflow_fallback",
    };
  }
  if (task.task_type === "contract_draft") {
    return {
      contract_title: `${hospitalName} 촬영 계약서`,
      contract_amount: amount,
      quote_number: quote.quote_number || registered.contract?.quote_number || null,
      scope: quoteItems.length ? quoteItems.map((item: any) => item.name || item.detail).filter(Boolean) : shootingItems,
      payment_terms: `계약금 ${Number(quote.deposit_rate ?? contractQuote.depositRate ?? 50)}%, 촬영 후 잔금 ${100 - Number(quote.deposit_rate ?? contractQuote.depositRate ?? 50)}%`,
      memo: registered.contract?.id ? "등록된 계약 및 견적 데이터를 불러왔습니다." : "등록된 견적 데이터를 기준으로 만든 계약서 초안입니다.",
      source: registered.contract?.id ? "registered_contract" : quote.id ? "registered_quote" : "workflow_fallback",
    };
  }
  if (task.task_type === "conti_draft") {
    return {
      title: registered.conti?.title || `${hospitalName} 촬영 콘티`,
      shoot_date: shootDate,
      scenes: registered.conti?.result?.scenes || registered.conti?.result?.conti || shootingItems.map((title: string, index: number) => ({
        time: `${String(9 + index).padStart(2, "0")}:30`,
        title,
        note: extracted.special_notes || extracted.specialNotes || "상담 메모에 등록된 촬영 항목",
      })),
      checklist: registered.conti?.result?.checklist || extracted.preparation_items || extracted.preparationItems || [],
      specialties: registered.conti?.specialties || (registered.client?.department ? [registered.client.department] : []),
      source: registered.conti?.id ? "registered_conti" : consultation.id ? "registered_consultation" : "workflow_fallback",
    };
  }
  if (task.task_type === "review_summarize") {
    return {
      summary: `${hospitalName} 촬영 경험을 병원의 신뢰 이미지 관점으로 요약했습니다.`,
      public_phrases: ["공간과 사람의 분위기가 자연스럽게 드러난 촬영", "병원의 첫인상이 정돈된 이미지"],
      sns_candidates: ["촬영 후 가장 많이 들은 한마디", "병원사진이 신뢰가 되는 순간"],
    };
  }
  if (task.task_type === "per_points_calculate") {
    // registered_data에 견적/계약 스냅샷이 없어 하드코딩 기본값(2,200,000원)으로 떨어지는 경우,
    // 이 고객의 가장 최근 계약 금액을 실제 DB에서 조회해 대체한다 — PER은 실제 촬영금액 기준이어야 한다.
    let baseAmount = amount;
    const usedFallback =
      !quote.total_amount && !contractQuote.totalAmount && !contractQuote.total_amount &&
      !task.input_data?.amount && !task.input_data?.total_amount;
    const clientId = task.client_id ?? run?.client_id ?? null;
    if (usedFallback && clientId) {
      const { data: latestContract } = await db
        .from("contracts")
        .select("quote_data")
        .eq("client_id", clientId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      const contractAmount = Number(
        latestContract?.quote_data?.totalAmount || latestContract?.quote_data?.total_amount || 0
      );
      if (contractAmount > 0) baseAmount = contractAmount;
    }

    const supplyForReward = Math.round(baseAmount / 1.1);
    const points = Math.floor(supplyForReward * 0.01);
    return {
      base_amount: baseAmount,
      supply_amount: supplyForReward,
      point_rate: 0.01,
      earned_points: points,
      memo: "VAT 제외 공급가 기준 1% PER 포인트 계산",
    };
  }

  return {
    hospital_name: hospitalName,
    project_name: projectName,
    subject: buildMailSubject(task.task_type, hospitalName),
    body_summary: `${hospitalName} ${projectName} 관련 워크플로우 초안입니다.`,
    created_at: new Date().toISOString(),
  };
}

async function ensureMailingDraft(db: SupabaseClient, task: any, run: any, automation: StepAutomation, output: any) {
  const { data: existing, error: existingError } = await db
    .from("mailing_queue")
    .select("*")
    .eq("source_module", "workflow_agent")
    .eq("source_id", task.id)
    .limit(1);
  if (existingError) throw new Error(existingError.message);
  if (existing?.length) return existing[0];

  const registered = (task.input_data?.registered_data ?? {}) as WorkflowRegisteredData;
  const contact = workflowContact(registered, run ?? task);
  const hospitalName = contact.hospitalName;
  const contactName = contact.managerName;
  const toEmail = contact.email || run?.contact_email || task.input_data?.to_email || "";
  const type = automation.mailing_type || "proposal";
  const links = buildMailLinks(task.task_type, hospitalName, output);

  const { data, error } = await db
    .from("mailing_queue")
    .insert({
      type,
      source_module: "workflow_agent",
      source_id: task.id,
      workflow_run_id: task.workflow_run_id,
      workflow_step_key: task.workflow_step_key,
      agent_task_id: task.id,
      related_type: task.task_type,
      related_id: task.id,
      mailing_type: type,
      approval_status: "pending",
      status: "draft",
      hospital_name: hospitalName,
      contact_name: contactName,
      to_email: toEmail,
      subject: buildMailSubject(task.task_type, hospitalName),
      body: buildMailBody(task.task_type, hospitalName, contactName, output),
      links,
    })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}

async function ensureApproval(db: SupabaseClient, task: any, run: any, automation: StepAutomation, output: any, relatedType: string, relatedId: string) {
  const { data: existing, error: existingError } = await db
    .from("agent_approvals")
    .select("*")
    .eq("agent_task_id", task.id)
    .neq("status", "rejected")
    .limit(1);
  if (existingError) throw new Error(existingError.message);
  if (existing?.length) return existing[0];

  const approvalType = automation.approval_type || approvalTypeFromTask(task.task_type) || "other";
  const { data, error } = await db
    .from("agent_approvals")
    .insert({
      client_id: task.client_id ?? run?.client_id ?? null,
      project_id: task.project_id ?? run?.project_id ?? null,
      workflow_run_id: task.workflow_run_id,
      workflow_step_key: task.workflow_step_key,
      client_name: run?.client_name || task.client_name || "",
      project_name: run?.project_name || task.project_name || "",
      agent_task_id: task.id,
      approval_type: approvalType,
      title: `${automation.title} 승인`,
      description: `${run?.client_name || task.client_name || "고객"}의 ${automation.title} 결과를 확인해주세요.`,
      preview_data: output,
      related_type: relatedType,
      related_id: relatedId,
      status: "pending",
    })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}

async function ensureRewardTransaction(db: SupabaseClient, task: any, run: any, output: any) {
  const clientId = task.client_id ?? run?.client_id ?? null;
  if (!clientId) {
    await logAgent(db, { workflow_run_id: task.workflow_run_id, agent_task_id: task.id, log_type: "reward_transaction_skipped", message: "client_id가 없어 PER 포인트 기록을 건너뛰었습니다.", success: false });
    return null;
  }

  const { data: existing } = await db
    .from("reward_transactions")
    .select("id")
    .eq("source_type", "project")
    .eq("source_id", task.id)
    .limit(1);
  if (existing?.length) return existing[0];

  // addPoints()가 reward_transactions 기록과 clients.available_points/total_earned_points/
  // total_paid_amount/reward_tier 갱신을 한번에 처리한다 (기존에는 reward_transactions에만
  // 직접 insert해서 고객 레코드의 누적 포인트/촬영금액이 실제로는 갱신되지 않던 버그였다).
  try {
    const txId = await addPoints(clientId, output.earned_points ?? 0, {
      type: "earn",
      amount: output.supply_amount ?? 0,
      sourceType: "project",
      sourceId: task.id,
      memo: `${run?.client_name || task.client_name || "고객"} 촬영 PER 포인트 적립`,
      createdBy: "olivia_workflow",
    });
    return { id: txId };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await logAgent(db, { workflow_run_id: task.workflow_run_id, agent_task_id: task.id, log_type: "reward_transaction_skipped", message: "reward_transactions 기록을 건너뛰었습니다.", success: false, error_message: message });
    return null;
  }
}

function buildMailSubject(taskType: string, hospitalName: string) {
  if (taskType.includes("quote")) return `[포토클리닉] ${hospitalName} 촬영 견적서 안내드립니다`;
  if (taskType.includes("contract")) return `[포토클리닉] ${hospitalName} 촬영 계약서 확인 요청드립니다`;
  if (taskType.includes("conti")) return `[포토클리닉] ${hospitalName} 촬영 콘티 확인 부탁드립니다`;
  if (taskType.includes("original")) return `[포토클리닉] ${hospitalName} 원본 데이터 공유드립니다`;
  if (taskType.includes("gallery")) return `[포토클리닉] ${hospitalName} 최종 촬영본 공유드립니다`;
  if (taskType.includes("review")) return `[포토클리닉] ${hospitalName} 촬영 후기 작성 부탁드립니다`;
  if (taskType.includes("per")) return `[포토클리닉] ${hospitalName} PER 포인트 적립 안내`;
  if (taskType.includes("reminder")) return `[포토클리닉] ${hospitalName} 촬영 준비 안내드립니다`;
  return `[포토클리닉] ${hospitalName} 촬영 안내드립니다`;
}

function buildMailBody(taskType: string, hospitalName: string, contactName: string, output: any) {
  const name = contactName || "담당자님";
  const subjectLine = buildMailSubject(taskType, hospitalName);
  return [
    `안녕하세요. 병원이야기를 전하는 포토클리닉입니다.`,
    `${name}.`,
    ``,
    `${subjectLine.replace("[포토클리닉] ", "")}`,
    ``,
    `아래 내용은 올리비아가 자동으로 만든 초안입니다. 대표님 승인 후 메일링함에서 발송해주세요.`,
    ``,
    output.memo || output.body_summary || output.summary || "확인 부탁드립니다.",
    ``,
    `감사합니다.`,
    `포토클리닉 드림`,
  ].join("\n");
}

function buildMailLinks(taskType: string, hospitalName: string, output: any) {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || "https://olivia.photoclinic.kr";
  if (taskType.includes("review")) {
    return [{ label: "리뷰 작성하기", url: `${baseUrl}/review?hospital=${encodeURIComponent(hospitalName)}` }];
  }
  if (taskType.includes("gallery") || taskType.includes("original")) {
    return [{ label: "자료 확인하기", url: output.nas_link || output.nasLink || `${baseUrl}/gallery` }];
  }
  return [{ label: "고객 포털 확인", url: `${baseUrl}/client-portal` }];
}
