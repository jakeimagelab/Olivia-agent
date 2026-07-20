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
