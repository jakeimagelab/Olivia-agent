import { SupabaseClient } from "@supabase/supabase-js";
import { STEP_NAME, WORKFLOW_STEPS } from "@/lib/workflow";

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
  revision: [
    {
      task_type: "revision_review",
      title: "수정 요청 검토",
      description: "고객 수정 요청을 유형별로 정리하고 우선순위를 지정합니다.",
      requires_approval: false,
      creates_mailing_draft: false,
      priority: "high",
    },
  ],
  final_delivery: [
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
  const sorted = [...WORKFLOW_STEPS].sort((a, b) => a.order_index - b.order_index);
  const currentIndex = sorted.findIndex((step) => step.key === stepKey);
  return currentIndex >= 0 ? sorted[currentIndex + 1]?.key ?? null : null;
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
          automation,
        },
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    created.push(data);
  }

  await logAgent(db, {
    workflow_run_id: workflowRunId,
    log_type: "step_tasks_created",
    message: `${STEP_NAME[stepKey] || stepKey} 단계 자동 작업 ${created.length}개 생성`,
    output_summary: created.map((task) => task.task_type).join(", "),
  });

  return { created, skipped: false };
}

export async function advanceWorkflow(db: SupabaseClient, input: { workflow_run_id: string; to_step_key?: string | null; reason?: string }) {
  const run = await getWorkflowRun(db, input.workflow_run_id);
  const fromStep = run.current_step_key;
  const toStep = input.to_step_key || getNextWorkflowStep(fromStep);
  const now = new Date().toISOString();
  if (!toStep) {
    await db.from("workflow_runs").update({ status: "completed", completed_at: now, updated_at: now }).eq("id", run.id);
    await logAgent(db, { workflow_run_id: run.id, log_type: "workflow_completed", message: `${run.client_name || "워크플로우"} 전체 단계가 완료되었습니다.` });
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

  await ensureStepRun(db, run.id, toStep, "in_progress");
  const taskResult = await createStepTasks(db, run.id, toStep);

  await logAgent(db, {
    workflow_run_id: run.id,
    log_type: "step_advanced",
    message: `${STEP_NAME[fromStep] || fromStep} → ${STEP_NAME[toStep] || toStep} 단계로 이동했습니다.`,
    input_summary: input.reason ?? "",
    output_summary: `created_tasks: ${taskResult.created.length}`,
  });

  return { completed: false, from_step_key: fromStep, to_step_key: toStep, created: taskResult.created };
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
  if (hasOpenTask || hasPendingApproval) return { advanced: false, reason: "open_items" };

  const result = await advanceWorkflow(db, { workflow_run_id: workflowRunId, reason: "required tasks and approvals completed" });
  return { advanced: true, result };
}

export async function executeWorkflowTask(db: SupabaseClient, taskId: string) {
  const { data: task, error: taskError } = await db.from("agent_tasks").select("*").eq("id", taskId).single();
  if (taskError || !task) throw new Error(taskError?.message ?? "task not found");

  const automation = findAutomation(task.workflow_step_key, task.task_type);
  const run = task.workflow_run_id ? await getWorkflowRun(db, task.workflow_run_id) : null;
  const now = new Date().toISOString();

  await db.from("agent_tasks").update({ status: "running", started_at: task.started_at ?? now, updated_at: now, error_message: "" }).eq("id", task.id);

  try {
    const output = buildTaskOutput(task, run);
    let relatedType = task.task_type;
    let relatedId = `${task.task_type}-${task.id}`;
    let mailingId: string | null = null;

    if (automation?.creates_mailing_draft) {
      const mailing = await ensureMailingDraft(db, task, run, automation, output);
      mailingId = mailing.id;
      relatedType = "mailing_queue";
      relatedId = mailing.id;
    }

    if (automation?.requires_approval) {
      const approval = await ensureApproval(db, task, run, automation, output, relatedType, relatedId);
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
      return { task: data, approval, output };
    }

    if (task.task_type === "per_points_calculate") {
      await ensureRewardTransaction(db, task, run, output);
    }

    const { data, error } = await db
      .from("agent_tasks")
      .update({ status: "completed", output_data: output, completed_at: now, updated_at: now })
      .eq("id", task.id)
      .select()
      .single();
    if (error) throw new Error(error.message);

    await logAgent(db, { workflow_run_id: task.workflow_run_id, agent_task_id: task.id, log_type: "task_completed", message: `${task.title} 작업이 완료되었습니다.`, output_summary: JSON.stringify(output).slice(0, 300) });
    if (task.workflow_run_id && task.workflow_step_key) await maybeAdvanceWorkflow(db, task.workflow_run_id, task.workflow_step_key);
    return { task: data, output };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await db.from("agent_tasks").update({ status: "failed", error_message: message, updated_at: new Date().toISOString() }).eq("id", task.id);
    await logAgent(db, { workflow_run_id: task.workflow_run_id, agent_task_id: task.id, log_type: "task_failed", message: `${task.title} 작업 실패`, success: false, error_message: message });
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

  await logAgent(db, {
    workflow_run_id: approval.workflow_run_id,
    agent_task_id: approval.agent_task_id,
    log_type: "approval_approved",
    message: `${approval.title} 항목이 승인되었습니다.`,
    output_summary: `${approval.related_type}:${approval.related_id}`,
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

function buildTaskOutput(task: any, run: any) {
  const hospitalName = run?.client_name || task.client_name || "병원";
  const projectName = run?.project_name || task.project_name || "촬영 프로젝트";
  const shootDate = run?.shoot_date || task.input_data?.shoot_date || "";
  const amount = Number(task.input_data?.amount || task.input_data?.total_amount || 2200000);
  const supply = Math.round(amount / 1.1);

  if (task.task_type === "quote_draft") {
    return {
      package_name: projectName || "포토클리닉 촬영 패키지",
      base_amount: amount,
      options: ["원장 프로필", "상담 장면", "공간 무드컷", "하모니컷"],
      discount: 0,
      vat: amount - supply,
      total_amount: amount,
      memo: `${hospitalName} 상담 내용을 기준으로 생성한 견적 초안입니다.`,
    };
  }
  if (task.task_type === "contract_draft") {
    return {
      contract_title: `${hospitalName} 촬영 계약서`,
      contract_amount: amount,
      scope: ["병원 브랜드 촬영", "보정본 납품", "홈페이지/SNS 활용"],
      payment_terms: "계약금 50%, 촬영 후 잔금 50%",
      memo: "전자서명 연동 전 계약서 초안 데이터입니다.",
    };
  }
  if (task.task_type === "conti_draft") {
    return {
      title: `${hospitalName} 촬영 콘티`,
      shoot_date: shootDate,
      scenes: [
        { time: "09:30", title: "공간 첫인상", note: "로비와 진료 동선을 차분하게 기록" },
        { time: "10:30", title: "원장님 상담 장면", note: "진료 철학과 설명 태도가 보이는 컷" },
        { time: "11:30", title: "직원 응대", note: "병원의 온도와 신뢰를 보여주는 하모니컷" },
      ],
      checklist: ["의료진 가운", "상담실 정리", "공간 소품", "브랜드 컬러 소품"],
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
    const points = Math.floor(supply * 0.01);
    return {
      base_amount: amount,
      supply_amount: supply,
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

  const hospitalName = run?.client_name || task.client_name || "병원";
  const contactName = run?.contact_name || run?.manager_name || task.input_data?.manager_name || "";
  const toEmail = run?.contact_email || task.input_data?.to_email || "";
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

  const payload = {
    client_id: clientId,
    type: "earn",
    points: output.earned_points ?? 0,
    amount: output.supply_amount ?? 0,
    memo: `${run?.client_name || task.client_name || "고객"} 촬영 PER 포인트 적립`,
    balance_after: output.earned_points ?? 0,
    source_type: "project",
    source_id: task.id,
  };
  const { data, error } = await db.from("reward_transactions").insert(payload).select().single();
  if (error) {
    await logAgent(db, { workflow_run_id: task.workflow_run_id, agent_task_id: task.id, log_type: "reward_transaction_skipped", message: "reward_transactions 기록을 건너뛰었습니다.", success: false, error_message: error.message });
    return null;
  }
  return data;
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
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || "https://olivia-agent-smoky.vercel.app";
  if (taskType.includes("review")) {
    return [{ label: "리뷰 작성하기", url: `${baseUrl}/review?hospital=${encodeURIComponent(hospitalName)}` }];
  }
  if (taskType.includes("gallery") || taskType.includes("original")) {
    return [{ label: "자료 확인하기", url: output.nas_link || output.nasLink || `${baseUrl}/gallery` }];
  }
  return [{ label: "고객 포털 확인", url: `${baseUrl}/client-portal` }];
}
