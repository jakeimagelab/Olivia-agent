import type { SupabaseClient } from "@supabase/supabase-js";
import { advanceWorkflow, executeWorkflowTask } from "@/lib/workflowAutomation";
import { createEventDeduplicationKey, emitOliviaEventSafely } from "@/lib/olivia/events";
import { canRunWithoutApproval, normalizePermission } from "@/lib/olivia/permissions";
import type { OliviaRecommendedAction, OliviaRuleCandidate, OliviaWorkflowContext } from "@/lib/olivia/types";

export async function saveOliviaInsight(
  db: SupabaseClient,
  context: OliviaWorkflowContext,
  candidate: OliviaRuleCandidate,
  priorityScore: number,
  eventId?: string | null,
) {
  const { data, error } = await db.rpc("upsert_olivia_insight", {
    p_insight: {
      insight_type: candidate.insightType,
      title: candidate.title,
      summary: candidate.summary,
      reason: candidate.reason,
      client_id: context.workflowRun.client_id ?? null,
      project_id: context.workflowRun.project_id ?? null,
      workflow_run_id: context.workflowRun.id,
      event_id: eventId ?? null,
      priority_score: priorityScore,
      urgency_score: candidate.urgencyScore,
      impact_score: candidate.impactScore,
      confidence: candidate.confidence,
      recommended_action: candidate.recommendedAction?.title ?? "",
      recommended_due_at: candidate.recommendedDueAt ?? candidate.recommendedAction?.dueAt ?? null,
      deduplication_key: candidate.deduplicationKey,
    },
  });
  if (error) throw new Error(error.message);
  const insight = Array.isArray(data) ? data[0] : data;
  if (!insight) throw new Error("Olivia 인사이트 저장 결과가 없습니다.");
  return insight;
}

async function createApprovalForAction(db: SupabaseClient, action: any, context: OliviaWorkflowContext) {
  const taskType = `olivia_${action.action_type}_${action.id}`;
  const { data: task, error: taskError } = await db.from("agent_tasks").insert({
    client_id: action.client_id,
    project_id: action.project_id,
    workflow_run_id: action.workflow_run_id,
    task_type: taskType,
    title: action.title,
    description: action.description,
    input_data: { olivia_action_id: action.id, ...action.action_payload },
    priority: action.permission_level === "owner_only" ? "urgent" : "high",
    status: "waiting_approval",
    client_name: context.workflowRun.client_name || "",
    project_name: context.workflowRun.project_name || "",
  }).select("*").single();
  if (taskError) throw new Error(taskError.message);

  const { data: approval, error: approvalError } = await db.from("agent_approvals").insert({
    client_id: action.client_id,
    project_id: action.project_id,
    workflow_run_id: action.workflow_run_id,
    agent_task_id: task.id,
    approval_type: "other",
    title: action.title,
    description: action.description,
    preview_data: { actionType: action.action_type, payload: action.action_payload, permissionLevel: action.permission_level },
    related_type: "olivia_action",
    related_id: action.id,
    status: "pending",
    client_name: context.workflowRun.client_name || "",
    project_name: context.workflowRun.project_name || "",
  }).select("*").single();
  if (approvalError) throw new Error(approvalError.message);

  const { data: updated, error: updateError } = await db.from("olivia_actions").update({
    status: "waiting_approval",
    agent_task_id: task.id,
    approval_id: approval.id,
  }).eq("id", action.id).select("*").single();
  if (updateError) throw new Error(updateError.message);

  await emitOliviaEventSafely(db, {
    eventType: "approval.requested",
    eventSource: "olivia_action_planner",
    clientId: action.client_id,
    projectId: action.project_id,
    workflowRunId: action.workflow_run_id,
    payload: { approvalId: approval.id, taskId: task.id, actionId: action.id },
    deduplicationKey: createEventDeduplicationKey("approval.requested", approval.id),
  });
  return updated;
}

async function createInternalTask(db: SupabaseClient, action: any, context: OliviaWorkflowContext) {
  const { data: task, error } = await db.from("agent_tasks").insert({
    client_id: action.client_id,
    project_id: action.project_id,
    workflow_run_id: action.workflow_run_id,
    task_type: `olivia_${action.action_type}_${action.id}`,
    title: action.title,
    description: action.description,
    input_data: { olivia_action_id: action.id, ...action.action_payload },
    priority: "high",
    status: "pending",
    client_name: context.workflowRun.client_name || "",
    project_name: context.workflowRun.project_name || "",
  }).select("*").single();
  if (error) throw new Error(error.message);
  await emitOliviaEventSafely(db, {
    eventType: "agent.task_created",
    eventSource: "olivia_action_planner",
    clientId: action.client_id,
    projectId: action.project_id,
    workflowRunId: action.workflow_run_id,
    payload: { taskId: task.id, taskType: task.task_type, actionId: action.id },
    deduplicationKey: createEventDeduplicationKey("agent.task_created", task.id),
  });
  return task;
}

export async function runOliviaAction(db: SupabaseClient, action: any, context?: OliviaWorkflowContext) {
  const now = new Date().toISOString();
  const { data: running, error: runningError } = await db
    .from("olivia_actions")
    .update({ status: "running", error_message: "" })
    .eq("id", action.id)
    .in("status", ["suggested", "prepared", "approved"])
    .select("*")
    .maybeSingle();
  if (runningError) throw new Error(runningError.message);
  if (!running) throw new Error("실행할 수 없는 Olivia 행동 상태입니다.");

  try {
    let result: Record<string, unknown> = { preparedOnly: true };
    if (running.action_type === "advance_workflow") {
      result = await advanceWorkflow(db, {
        workflow_run_id: running.workflow_run_id,
        from_step_key: running.action_payload?.fromStepKey,
        reason: `Olivia action ${running.id}`,
      });
    } else if (running.action_type === "retry_failed_task") {
      const taskId = String(running.action_payload?.taskId || "");
      if (!taskId) throw new Error("재실행할 taskId가 없습니다.");
      const { data: task } = await db.from("agent_tasks").select("retry_count").eq("id", taskId).single();
      await db.from("agent_tasks").update({ retry_count: Number(task?.retry_count || 0) + 1, status: "pending" }).eq("id", taskId);
      result = await executeWorkflowTask(db, taskId);
    } else if (running.action_type === "update_next_action") {
      const { data: run, error: runError } = await db.from("workflow_runs").select("next_action,next_action_source").eq("id", running.workflow_run_id).single();
      if (runError) throw new Error(runError.message);
      if (!String(run.next_action || "").trim() || run.next_action_source === "ai") {
        const nextAction = String(running.action_payload?.nextAction || running.title);
        const { error } = await db.from("workflow_runs").update({
          next_action: nextAction,
          next_action_source: "ai",
          next_action_due_at: running.due_at,
          next_action_updated_at: now,
        }).eq("id", running.workflow_run_id);
        if (error) throw new Error(error.message);
        result = { nextAction };
      } else {
        result = { skipped: true, reason: "manual_next_action" };
      }
    } else if (["create_agent_task", "create_internal_reminder"].includes(running.action_type)) {
      if (!context) throw new Error("내부 업무 생성에 워크플로우 문맥이 필요합니다.");
      const task = await createInternalTask(db, running, context);
      result = { taskId: task.id };
    }

    const { data: completed, error } = await db.from("olivia_actions").update({
      status: "completed", executed_at: now, result_data: result,
    }).eq("id", running.id).select("*").single();
    if (error) throw new Error(error.message);
    return completed;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await db.from("olivia_actions").update({ status: "failed", error_message: message.slice(0, 1_000) }).eq("id", running.id);
    throw error;
  }
}

export async function planOliviaAction(
  db: SupabaseClient,
  context: OliviaWorkflowContext,
  insight: any,
  recommendedAction: OliviaRecommendedAction | null | undefined,
) {
  if (!recommendedAction) return null;
  const permissionLevel = normalizePermission(recommendedAction.actionType, recommendedAction.permissionLevel);
  const deduplicationKey = `action:${insight.deduplication_key}:${recommendedAction.actionType}`;
  const row = {
    insight_id: insight.id,
    event_id: insight.event_id,
    client_id: insight.client_id,
    project_id: insight.project_id,
    workflow_run_id: insight.workflow_run_id,
    action_type: recommendedAction.actionType,
    title: recommendedAction.title,
    description: recommendedAction.description,
    action_payload: recommendedAction.payload ?? {},
    permission_level: permissionLevel,
    status: canRunWithoutApproval(permissionLevel) ? "suggested" : "prepared",
    deduplication_key: deduplicationKey,
    due_at: recommendedAction.dueAt ?? insight.recommended_due_at ?? null,
  };

  let { data: action, error } = await db.from("olivia_actions").insert(row).select("*").single();
  if (error?.code === "23505") {
    const existing = await db.from("olivia_actions").select("*").eq("deduplication_key", deduplicationKey).maybeSingle();
    if (existing.error) throw new Error(existing.error.message);
    action = existing.data;
    error = null;
  }
  if (error) throw new Error(error.message);
  if (!action) return null;

  if (canRunWithoutApproval(permissionLevel) && !["completed", "running"].includes(action.status)) {
    return runOliviaAction(db, action, context);
  }
  if (!["waiting_approval", "approved", "completed", "dismissed"].includes(action.status)) {
    return createApprovalForAction(db, action, context);
  }
  return action;
}
