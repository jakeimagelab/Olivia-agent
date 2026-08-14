import type { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { fuzzyNameSearchOne } from "@/lib/olivia/nameSearch";
import { logActivity } from "@/lib/activityLogger";
import { getWorkflowDisplayStepKey, isToolOnlyStep, type ToolOnlyStepKey } from "@/lib/workflow";
import { buildWorkflowNextAction } from "@/lib/workflowNextAction";
import { getErrorMessage } from "@/lib/errors";
import {
  advanceWorkflow,
  approveWorkflowItem,
  completeWorkflowRetroactively as completeWorkflowRunRetroactively,
  createStepTasks,
  executeWorkflowTask,
  getWorkflowRun,
  maybeAdvanceWorkflow,
} from "@/lib/workflowAutomation";

const STEP_LABELS: Record<string, string> = {
  consult_meeting: "1. 상담/미팅", quote: "2. 견적서", contract: "3. 계약서", conti: "4. 콘티",
  shooting: "5. 촬영", backup_sorting: "6. 백업/분류", original_delivery: "7. 원본 전달",
  client_selection: "8. 고객 셀렉", raw_matching: "9. RAW 매칭", retouching: "10. 보정",
  revision: "11. 수정 접수", seo_delivery: "12. SEO 납품", final_delivery: "13. 최종 전달",
  review_content: "14. 후기 콘텐츠", reward: "15. 리워드", customer_care: "16. 고객 케어", content_planning: "17. 콘텐츠 기획",
};

const TASK_STATUS_LABEL: Record<string, string> = {
  pending: "대기", running: "처리 중", waiting_approval: "승인 대기",
  completed: "완료", failed: "오류", canceled: "생략됨",
};

// components/NextActionCard.tsx/app/(client-hub)/clients/page.tsx가 quote/contract/conti
// 단계에서 "올리비아가 현재 단계 처리하기" 버튼 대신 보여주는 것과 같은 안내 — 채팅 경로도
// 실제 문서 없이 이 단계를 건너뛰지 않도록 lib/workflow.ts의 TOOL_ONLY_STEP_KEYS를 그대로 쓴다.
const TOOL_STEP_BUILDER_HINT: Record<ToolOnlyStepKey, string> = {
  quote: "이 단계는 실제 견적서가 있어야 넘어갈 수 있어요. 고객 프로젝트 페이지에서 \"+ 견적서 작성하기\"로 실제 견적서를 만들어주세요.",
  contract: "이 단계는 실제 계약서가 있어야 넘어갈 수 있어요. 고객 프로젝트 페이지에서 \"+ 계약서 작성하기\"로 실제 계약서를 만들어주세요.",
  conti: "이 단계는 실제 콘티가 있어야 넘어갈 수 있어요. 고객 프로젝트 페이지에서 \"+ 콘티 작성하기\"로 실제 콘티를 만들어주세요.",
};

const REAL_DOCUMENT_TABLE: Record<ToolOnlyStepKey, string> = {
  quote: "quotes",
  contract: "contracts",
  conti: "conti_saves",
};

async function resolveActiveRun(clientName: string) {
  const db = getSupabaseAdmin();
  return fuzzyNameSearchOne<any>({
    db, table: "workflow_runs", nameColumn: "client_name",
    select: "id, client_name, current_step_key, status",
    query: clientName,
    filter: (q: any) => q.eq("status", "active").order("updated_at", { ascending: false }),
  });
}

async function hasRealDocumentForStep(workflowRunId: string, stepKey: ToolOnlyStepKey) {
  const db = getSupabaseAdmin();
  const { data } = await db.from(REAL_DOCUMENT_TABLE[stepKey]).select("id").eq("workflow_run_id", workflowRunId).limit(1);
  return Boolean(data && data.length);
}

// 이 파일의 모든 도구는 자기 자신의 /api/workflow, /api/agent 라우트를 HTTP로 다시 호출하지 않고
// lib/workflowAutomation.ts의 로직을 같은 프로세스 안에서 직접 호출한다. 예전에는 fetch(origin + ...)로
// 자체 API를 불렀는데, 그 라우트들이 middleware.ts의 protectedApiPrefixes에 걸려 있어(관리자 세션
// 쿠키 필요) 브라우저 쿠키 없는 서버 쪽 자체 호출은 항상 401("관리자 로그인이 필요합니다")로 실패했다
// — x-internal-key 우회가 있긴 하지만 INTERNAL_API_KEY가 프로덕션에 설정돼 있지 않아 무력화된
// 상태였다. 채팅으로 실제 재현하기 전까진 발견되지 않았던 버그(2026-08-14, advance_workflow_step도
// 동일하게 영향받고 있었다) — 근본적으로 HTTP 왕복 자체를 없애는 쪽으로 고쳤다.

// lib/assistant/core/legacyOliviaCore.ts의 executeTool()에서 그대로 옮긴 워크플로우
// 조회/전진/소급완료 — 레거시 Claude 경로와 v2 OpenAI 경로가 같은 구현을 공유한다.
export async function getWorkflowStatus(input: any) {
  const db = getSupabaseAdmin();
  const run = await fuzzyNameSearchOne<any>({
    db, table: "workflow_runs", nameColumn: "client_name",
    select: "id, client_name, current_step_key, status, updated_at, next_action",
    query: input.clientName,
    filter: (q: any) => q.eq("status", "active").order("updated_at", { ascending: false }),
  });
  if (!run) {
    return { action: "done", message: `⚠️ **${input.clientName}**의 활성 워크플로우를 찾을 수 없어요.\n/clients 에서 워크플로우를 시작해주세요.` };
  }
  const step = STEP_LABELS[run.current_step_key] ?? run.current_step_key;
  const updated = new Date(run.updated_at).toLocaleDateString("ko-KR", { month: "long", day: "numeric" });
  return {
    action: "done",
    message: `📋 **${run.client_name}** 워크플로우 현황\n\n**현재 단계:** ${step}\n**마지막 업데이트:** ${updated}\n\n다음 단계로 진행하려면 "다음 단계로 넘겨줘" 또는 "XX단계로 이동해줘"라고 말씀해주세요.`,
    clientName: run.client_name,
    currentStepKey: run.current_step_key,
  };
}

// req 파라미터는 레거시(Claude) 경로 호출부(lib/assistant/core/legacyOliviaCore.ts)와의 시그니처
// 호환을 위해 남겨둔다 — 이제 HTTP 자체 호출을 안 하므로 내부에서는 쓰지 않는다.
export async function advanceWorkflowStep(input: any, _req?: NextRequest | null) {
  const db = getSupabaseAdmin();
  const run = await fuzzyNameSearchOne<any>({
    db, table: "workflow_runs", nameColumn: "client_name",
    select: "id, client_name, current_step_key",
    query: input.clientName,
    filter: (q: any) => q.eq("status", "active").order("updated_at", { ascending: false }),
  });
  if (!run) {
    return { action: "done", message: `⚠️ **${input.clientName}**의 활성 워크플로우를 찾을 수 없어요.` };
  }
  // 화면 버튼과 같은 보호: 지금 있는 단계가 quote/contract/conti인데 그 단계의 실제 문서가
  // 하나도 없으면, 다른 단계로 건너뛰지 못하게 막는다(재현된 버그 — 설계 문서 참고).
  const currentDisplayStep = getWorkflowDisplayStepKey(run.current_step_key) || run.current_step_key;
  if (isToolOnlyStep(currentDisplayStep) && currentDisplayStep !== input.toStepKey) {
    const hasDocument = await hasRealDocumentForStep(run.id, currentDisplayStep);
    if (!hasDocument) {
      return { action: "done", message: TOOL_STEP_BUILDER_HINT[currentDisplayStep], clientName: run.client_name, currentStepKey: run.current_step_key };
    }
  }
  try {
    await advanceWorkflow(db, { workflow_run_id: run.id, to_step_key: input.toStepKey, reason: "올리비아 요청" });
  } catch (error) {
    return { action: "done", message: `❌ 단계 이동 실패: ${getErrorMessage(error)}` };
  }
  await logActivity("advance_workflow_step", run.client_name, { from: run.current_step_key, to: input.toStepKey });
  return {
    action: "done",
    message: `✅ **${run.client_name}** 워크플로우를 **${input.toStepKey}** 단계로 이동했어요!\n\n/clients 에서 다음 할 일을 확인해주세요.`,
    clientName: run.client_name,
    workflowRunId: run.id,
  };
}

export async function completeWorkflowRetroactively(input: any, _req?: NextRequest | null) {
  const db = getSupabaseAdmin();
  const run = await fuzzyNameSearchOne<any>({
    db, table: "workflow_runs", nameColumn: "client_name",
    select: "id, client_name, current_step_key, status",
    query: input.clientName,
    filter: (q: any) => q.neq("status", "completed").order("updated_at", { ascending: false }),
  });
  if (!run) {
    return { action: "done", message: `⚠️ **${input.clientName}**의 진행 중인 워크플로우를 찾을 수 없어요. 먼저 고객/워크플로우를 등록해주세요.` };
  }
  try {
    await completeWorkflowRunRetroactively(db, { workflow_run_id: run.id, reason: input.reason || "소급 등록" });
  } catch (error) {
    return { action: "done", message: `⚠️ 완료 처리 실패: ${getErrorMessage(error)}` };
  }
  return { action: "done", message: `✅ **${input.clientName}** 워크플로우를 전체 완료 처리했어요.`, clientName: input.clientName };
}

async function loadStepChecklist(workflowRunId: string) {
  const db = getSupabaseAdmin();
  const [run, tasksRes, approvalsRes, mailingRes] = await Promise.all([
    getWorkflowRun(db, workflowRunId),
    db.from("agent_tasks").select("*").eq("workflow_run_id", workflowRunId).order("created_at", { ascending: false }),
    db.from("agent_approvals").select("*").eq("workflow_run_id", workflowRunId).order("created_at", { ascending: false }),
    db.from("mailing_queue").select("*").eq("workflow_run_id", workflowRunId).order("created_at", { ascending: false }),
  ]);
  if (tasksRes.error) throw new Error(tasksRes.error.message);
  if (approvalsRes.error) throw new Error(approvalsRes.error.message);
  const action = buildWorkflowNextAction({
    run, tasks: tasksRes.data || [], approvals: approvalsRes.data || [], mailing: mailingRes.data || [],
  });
  return { run, tasks: action.tasks, approvals: action.approvals };
}

// components/NextActionCard.tsx의 "업무 프로세스" 체크리스트를 채팅으로 조회한다(읽기 전용).
export async function listWorkflowStepTasks(input: any, _req?: NextRequest | null) {
  const activeRun = await resolveActiveRun(input.clientName);
  if (!activeRun) {
    return { action: "done", message: `⚠️ **${input.clientName}**의 활성 워크플로우를 찾을 수 없어요.` };
  }
  const { run, tasks } = await loadStepChecklist(activeRun.id);
  const stepLabel = STEP_LABELS[run.current_step_key] ?? run.current_step_key;
  if (!tasks.length) {
    return {
      action: "done",
      message: `✅ **${run.client_name}** — ${stepLabel} 단계엔 업무 프로세스 항목이 없어요.`,
      clientName: run.client_name,
      currentStepKey: run.current_step_key,
    };
  }
  const lines = tasks.map((t: any) => `- ${t.title} (${TASK_STATUS_LABEL[t.status] ?? t.status})`).join("\n");
  return {
    action: "done",
    message: `📋 **${run.client_name}** — ${stepLabel} 업무 프로세스\n\n${lines}`,
    clientName: run.client_name,
    currentStepKey: run.current_step_key,
    tasks: tasks.map((t: any) => ({ id: t.id, title: t.title, status: t.status })),
  };
}

// components/NextActionCard.tsx의 "올리비아가 현재 단계 처리하기" 버튼과 완전히 동일하게 동작한다
// (app/api/workflow/run-current-step/route.ts와 같은 순서로 처리한다).
export async function processWorkflowStep(input: any, _req?: NextRequest | null) {
  const activeRun = await resolveActiveRun(input.clientName);
  if (!activeRun) {
    return { action: "done", message: `⚠️ **${input.clientName}**의 활성 워크플로우를 찾을 수 없어요.` };
  }
  const displayStepKey = getWorkflowDisplayStepKey(activeRun.current_step_key) || activeRun.current_step_key;
  if (isToolOnlyStep(displayStepKey)) {
    return {
      action: "done",
      message: TOOL_STEP_BUILDER_HINT[displayStepKey],
      clientName: activeRun.client_name,
      currentStepKey: activeRun.current_step_key,
      blocked: true,
    };
  }

  const db = getSupabaseAdmin();
  const stepKey = activeRun.current_step_key;
  try {
    await createStepTasks(db, activeRun.id, stepKey);

    const { data: pendingTasks, error: pendingError } = await db
      .from("agent_tasks").select("*")
      .eq("workflow_run_id", activeRun.id).eq("workflow_step_key", stepKey)
      .in("status", ["pending", "failed"]).order("created_at", { ascending: true });
    if (pendingError) throw new Error(pendingError.message);

    let executedCount = 0;
    for (const task of pendingTasks || []) {
      await executeWorkflowTask(db, task.id);
      executedCount += 1;
    }

    const { data: pendingApprovals } = await db
      .from("agent_approvals").select("id")
      .eq("workflow_run_id", activeRun.id).eq("workflow_step_key", stepKey).eq("status", "pending");

    const latestRun = await getWorkflowRun(db, activeRun.id);
    let advanced = false;
    let nextStepKey: string | null = null;
    if (latestRun.current_step_key !== stepKey) {
      advanced = true;
      nextStepKey = latestRun.current_step_key;
    } else if (!(pendingApprovals || []).length) {
      const advanceResult = await maybeAdvanceWorkflow(db, activeRun.id, stepKey);
      advanced = Boolean(advanceResult.advanced);
      nextStepKey = advanced && "result" in advanceResult ? (advanceResult.result?.to_step_key ?? null) : null;
    }

    await logActivity("process_workflow_step", activeRun.client_name, { stepKey, executedTasks: executedCount, advanced });

    const approvalsCount = pendingApprovals?.length || 0;
    const summary = approvalsCount > 0
      ? `${executedCount}개 작업을 처리했고 승인 대기 ${approvalsCount}개가 생성되었습니다.`
      : advanced
        ? `${executedCount}개 작업을 처리하고 다음 단계로 이동했습니다.`
        : `${executedCount}개 작업을 처리했습니다.`;
    const nextStepLabel = nextStepKey ? (STEP_LABELS[nextStepKey] ?? nextStepKey) : null;

    return {
      action: "done",
      message: advanced ? `✅ **${activeRun.client_name}** — ${summary} 다음 단계(${nextStepLabel})로 넘어갔어요.` : `✅ **${activeRun.client_name}** — ${summary}`,
      clientName: activeRun.client_name,
      currentStepKey: activeRun.current_step_key,
      advanced,
      nextStepKey,
    };
  } catch (error) {
    return { action: "done", message: `❌ 처리 실패: ${getErrorMessage(error)}` };
  }
}

// components/NextActionCard.tsx의 체크리스트에서 항목 하나를 골라 처리하는 것과 동일 — 제목으로
// 정확히 하나만 식별되면 승인 대기 중인 항목은 승인, 아니면 작업을 바로 실행한다.
export async function approveWorkflowTask(input: any, _req?: NextRequest | null) {
  const activeRun = await resolveActiveRun(input.clientName);
  if (!activeRun) {
    return { action: "done", message: `⚠️ **${input.clientName}**의 활성 워크플로우를 찾을 수 없어요.` };
  }
  const displayStepKey = getWorkflowDisplayStepKey(activeRun.current_step_key) || activeRun.current_step_key;
  if (isToolOnlyStep(displayStepKey)) {
    return {
      action: "done",
      message: TOOL_STEP_BUILDER_HINT[displayStepKey],
      clientName: activeRun.client_name,
      currentStepKey: activeRun.current_step_key,
      blocked: true,
    };
  }

  const { tasks, approvals } = await loadStepChecklist(activeRun.id);
  const actionable = tasks.filter((t: any) => t.status !== "completed" && t.status !== "canceled");
  const selector = String(input.taskSelector || "").trim().toLowerCase();
  const matches = selector ? actionable.filter((t: any) => String(t.title || "").toLowerCase().includes(selector)) : actionable;

  if (matches.length === 0) {
    const list = actionable.map((t: any) => `- ${t.title}`).join("\n") || "(남은 업무 없음)";
    return { action: "done", message: `"${input.taskSelector}"와(과) 일치하는 업무를 못 찾았어요. 지금 남은 업무는:\n${list}` };
  }
  if (matches.length > 1) {
    const list = matches.map((t: any) => `- ${t.title}`).join("\n");
    return { action: "done", message: `어떤 업무를 말씀하시는지 콕 집어 알려주세요:\n${list}` };
  }

  const task = matches[0];
  const pendingApproval = approvals.find((a: any) => a.agent_task_id === task.id && a.status === "pending");
  const db = getSupabaseAdmin();
  try {
    if (task.status === "waiting_approval" && pendingApproval) {
      await approveWorkflowItem(db, pendingApproval.id, "");
    } else {
      await executeWorkflowTask(db, task.id);
    }
  } catch (error) {
    return { action: "done", message: `❌ "${task.title}" 처리 실패: ${getErrorMessage(error)}` };
  }
  await logActivity("approve_workflow_task", activeRun.client_name, { stepKey: activeRun.current_step_key, taskTitle: task.title });
  return {
    action: "done",
    message: `✅ **${activeRun.client_name}** — "${task.title}" 처리했어요.`,
    clientName: activeRun.client_name,
    currentStepKey: activeRun.current_step_key,
    taskTitle: task.title,
  };
}
