import type { SupabaseClient } from "@supabase/supabase-js";
import { logAgent } from "@/lib/workflowAutomation";
import { analyzeOliviaCandidate } from "@/lib/olivia/analyzer";
import { planOliviaAction, saveOliviaInsight } from "@/lib/olivia/actionPlanner";
import { buildWorkflowContext } from "@/lib/olivia/context";
import { createEventDeduplicationKey, emitOliviaEventSafely, markOliviaEventFailed, markOliviaEventProcessed } from "@/lib/olivia/events";
import { evaluateOliviaRules } from "@/lib/olivia/rules";
import { calculatePriorityScore, getNotificationPolicy } from "@/lib/olivia/scoring";
import { sendTelegramNotification } from "@/lib/telegramNotifications";
import type { OliviaRuleCandidate } from "@/lib/olivia/types";

export const MAX_RUNS_PER_EXECUTION = 30;

export type ObserverResult = {
  checkedRuns: number;
  createdInsights: number;
  createdActions: number;
  skippedDuplicates: number;
  failedRuns: number;
};

function kstDate(value = new Date()) {
  return value.toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });
}

async function enhanceCandidate(candidate: OliviaRuleCandidate, context: Awaited<ReturnType<typeof buildWorkflowContext>>) {
  if (candidate.confidence >= 0.9) return candidate;
  try {
    const analysis = await analyzeOliviaCandidate(candidate, context);
    if (!analysis) return candidate;
    return {
      ...candidate,
      insightType: analysis.insightType,
      title: analysis.title || candidate.title,
      summary: analysis.summary || candidate.summary,
      reason: analysis.reason || candidate.reason,
      urgencyScore: analysis.urgencyScore,
      impactScore: analysis.impactScore,
      confidence: analysis.confidence,
      recommendedAction: analysis.recommendedAction ?? candidate.recommendedAction,
    } satisfies OliviaRuleCandidate;
  } catch {
    return candidate;
  }
}

async function registerNotification(db: SupabaseClient, insight: any, candidate: OliviaRuleCandidate, score: number) {
  if (getNotificationPolicy(score) !== "immediate") return false;
  const notificationKey = `${candidate.deduplicationKey}:dashboard:${kstDate()}`;
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1_000).toISOString();
  const { error } = await db.from("olivia_notification_history").insert({
    notification_key: notificationKey,
    notification_type: "urgent_insight",
    client_id: insight.client_id,
    project_id: insight.project_id,
    workflow_run_id: insight.workflow_run_id,
    insight_id: insight.id,
    channel: "dashboard",
    title: candidate.title,
    message: candidate.summary,
    expires_at: expiresAt,
  });
  if (error && error.code !== "23505") throw new Error(error.message);
  return !error;
}

export async function observeWorkflowRun(
  db: SupabaseClient,
  workflowRunId: string,
  options: { eventId?: string | null; now?: Date } = {},
) {
  const context = await buildWorkflowContext(db, workflowRunId, options.now);
  const rawCandidates = evaluateOliviaRules(context);
  let createdInsights = 0;
  let createdActions = 0;
  let skippedDuplicates = 0;

  for (const rawCandidate of rawCandidates) {
    const candidate = await enhanceCandidate(rawCandidate, context);
    const score = calculatePriorityScore(candidate);
    const { data: before } = await db.from("olivia_insights").select("id").eq("deduplication_key", candidate.deduplicationKey).maybeSingle();
    const insight = await saveOliviaInsight(db, context, candidate, score, options.eventId);
    if (before) skippedDuplicates += 1;
    else createdInsights += 1;

    if (candidate.ruleId === "RULE_09_COMMITMENT_OVERDUE") {
      const commitmentId = candidate.recommendedAction?.payload?.commitmentId;
      if (commitmentId) await db.from("meeting_commitments").update({ status: "overdue" }).eq("id", commitmentId).eq("status", "open");
    }

    const action = await planOliviaAction(db, context, insight, candidate.recommendedAction);
    if (action && !before) createdActions += 1;
    await registerNotification(db, insight, candidate, score);
  }

  await logAgent(db, {
    workflow_run_id: workflowRunId,
    log_type: "olivia_observer_checked",
    message: `Olivia Observer가 규칙 ${rawCandidates.length}개를 감지했습니다.`,
    output_summary: `insights:${createdInsights}, actions:${createdActions}, duplicates:${skippedDuplicates}`,
  });
  return { createdInsights, createdActions, skippedDuplicates, candidates: rawCandidates.length };
}

// Observer가 도는 김에 최근 실패한 자동화 작업을 스스로 찾아 텔레그램으로 먼저 보고한다.
// 대표님이 물어봐야만 답하던 check_recent_errors/generate_dev_request를 능동적으로 앞당기는 역할 —
// 다만 이 함수 자체는 하루 한 번 도는 올리비아 observer cron(vercel.json)에 얹혀서 실행되므로,
// "능동적"이어도 하루 한 번 이상 알림이 오지는 않는다 (Hobby 플랜은 cron을 더 자주 못 돌린다).
async function checkAndReportSystemIssues(db: SupabaseClient) {
  const sinceIso = new Date(Date.now() - 6 * 60 * 60_000).toISOString();
  const { data: failedTasks } = await db
    .from("agent_tasks")
    .select("id,title,error_message,updated_at")
    .eq("status", "failed")
    .gte("updated_at", sinceIso);

  if (!failedTasks || failedTasks.length === 0) return;

  const dedupKeys = failedTasks.map((task) => createEventDeduplicationKey("system.issue_reported", task.id));
  const { data: alreadyReported } = await db
    .from("olivia_events")
    .select("deduplication_key")
    .in("deduplication_key", dedupKeys);
  const reportedKeys = new Set((alreadyReported ?? []).map((row) => row.deduplication_key));

  const unreported = failedTasks.filter((task) => !reportedKeys.has(createEventDeduplicationKey("system.issue_reported", task.id)));
  if (unreported.length === 0) return;

  const summary = unreported.map((t) => `- ${t.title || "작업"}: ${t.error_message || "오류 상세 없음"}`).join("\n");
  const message = `🔧 올리비아가 문제를 발견했어요 (최근 6시간, ${unreported.length}건)\n\n${summary}\n\n"개발요청으로 만들어줘"라고 말씀하시면 Claude Code에 바로 넘길 스펙을 만들어드릴게요.`;

  try {
    await sendTelegramNotification(message);
  } catch (error) {
    console.error("[observer] 자가진단 텔레그램 발송 실패:", error instanceof Error ? error.message : String(error));
    return; // 발송 실패 시 미보고 상태로 남겨서 다음 실행에 다시 시도한다.
  }

  for (const task of unreported) {
    await emitOliviaEventSafely(db, {
      eventType: "system.issue_reported",
      eventSource: "observer_self_diagnosis",
      payload: { taskId: task.id, message: task.error_message ?? "" },
      deduplicationKey: createEventDeduplicationKey("system.issue_reported", task.id),
    });
  }
}

export async function runOliviaObserver(
  db: SupabaseClient,
  options: { workflowRunId?: string | null; eventId?: string | null; mode?: "single" | "all_active"; limit?: number } = {},
): Promise<ObserverResult> {
  let workflowRunIds: string[] = [];
  let eventId = options.eventId ?? null;

  if (eventId) {
    const { data: event, error } = await db.from("olivia_events").select("id,workflow_run_id").eq("id", eventId).single();
    if (error) throw new Error(error.message);
    if (event.workflow_run_id) workflowRunIds = [event.workflow_run_id];
    await db.from("olivia_events").update({ event_status: "processing" }).eq("id", eventId).eq("event_status", "pending");
  } else if (options.workflowRunId) {
    workflowRunIds = [options.workflowRunId];
  } else {
    const { data, error } = await db.from("workflow_runs").select("id").eq("status", "active").order("updated_at").limit(Math.min(options.limit ?? MAX_RUNS_PER_EXECUTION, MAX_RUNS_PER_EXECUTION));
    if (error) throw new Error(error.message);
    workflowRunIds = (data ?? []).map((run) => run.id);
  }

  const result: ObserverResult = { checkedRuns: 0, createdInsights: 0, createdActions: 0, skippedDuplicates: 0, failedRuns: 0 };
  for (const workflowRunId of workflowRunIds) {
    try {
      const observed = await observeWorkflowRun(db, workflowRunId, { eventId });
      result.checkedRuns += 1;
      result.createdInsights += observed.createdInsights;
      result.createdActions += observed.createdActions;
      result.skippedDuplicates += observed.skippedDuplicates;
    } catch (error) {
      result.failedRuns += 1;
      await logAgent(db, {
        workflow_run_id: workflowRunId,
        log_type: "olivia_observer_failed",
        message: "Olivia Observer 실행 실패",
        success: false,
        error_message: error instanceof Error ? error.message.slice(0, 1_000) : String(error).slice(0, 1_000),
      });
    }
  }

  if (eventId) {
    if (result.failedRuns) await markOliviaEventFailed(db, eventId, "Observer workflow processing failed");
    else await markOliviaEventProcessed(db, eventId);
  }
  return result;
}
