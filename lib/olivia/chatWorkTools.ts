import type { SupabaseClient } from "@supabase/supabase-js";
import { fuzzyIncludes } from "@/lib/olivia/nameSearch";
import { WORKFLOW_STEPS } from "@/lib/workflow";
import { approveWorkflowItem } from "@/lib/workflowAutomation";
import { planOliviaAction, runOliviaAction } from "@/lib/olivia/actionPlanner";
import { buildWorkflowContext } from "@/lib/olivia/context";
import { createEventDeduplicationKey, emitOliviaEventSafely } from "@/lib/olivia/events";
import { runOliviaObserver } from "@/lib/olivia/observer";
import {
  analyzeMeetingMemo,
  completeMeeting,
  getMeetingFollowups,
  linkMeetingClient,
  listMeetingMemos,
  listUpcomingMeetings,
  meetingCandidateToWorkItem,
  meetingCandidateSelectionItems,
  prepareMeetingBriefing,
} from "@/lib/olivia/meetingAssistant";
import {
  sortChatWorkItems,
  resolveWorkItemReference,
  type OliviaChatReference,
  type OliviaChatToolResult,
  type OliviaChatWorkItem,
} from "@/lib/olivia/chatTypes";

export const OLIVIA_CHAT_WORK_TOOL_NAMES = new Set([
  "get_today_briefing",
  "get_urgent_insights",
  "search_client_projects",
  "get_project_status",
  "list_pending_approvals",
  "list_commitments",
  "prepare_followup",
  "manage_olivia_action",
  "run_observer",
  "list_upcoming_meetings",
  "link_meeting_client",
  "prepare_meeting_brief",
  "analyze_meeting_memo",
  "complete_meeting",
  "get_meeting_followups",
  "check_recent_errors",
  "generate_dev_request",
]);

type ToolContext = { recentWorkItems?: OliviaChatReference[] };
type SafeResult<T> = { data: T; unavailable: boolean };

async function safeQuery<T>(query: PromiseLike<{ data: T | null; error: unknown }>, fallback: T): Promise<SafeResult<T>> {
  try {
    const result = await query;
    return result.error ? { data: fallback, unavailable: true } : { data: result.data ?? fallback, unavailable: false };
  } catch {
    return { data: fallback, unavailable: true };
  }
}

function clientName(row: Record<string, any>) {
  return String(row.client_name || row.hospital_name || row.name || "");
}

function stepName(key: string) {
  return WORKFLOW_STEPS.find((step) => step.key === key)?.name || key || "단계 미정";
}

function insightItem(row: Record<string, any>): OliviaChatWorkItem {
  return {
    id: row.id,
    kind: "insight",
    title: row.title,
    summary: row.summary || row.recommended_action || "확인이 필요한 운영 인사이트입니다.",
    clientName: row.client_name || undefined,
    projectName: row.project_name || undefined,
    workflowRunId: row.workflow_run_id || undefined,
    priorityScore: Number(row.priority_score || 0),
    dueAt: row.recommended_due_at || undefined,
    status: row.status,
    reason: row.reason || undefined,
    availableActions: ["view", "acknowledge", "prepare", "snooze", "dismiss"],
  };
}

function actionItem(row: Record<string, any>): OliviaChatWorkItem {
  const actions: OliviaChatWorkItem["availableActions"] = ["view"];
  if (row.status === "waiting_approval") actions.push("approve", "dismiss");
  else if (row.status === "approved") actions.push("run", "dismiss");
  else if (!["completed", "dismissed", "running"].includes(row.status)) actions.push("dismiss");
  return {
    id: row.id,
    kind: "action",
    title: row.title,
    summary: row.description || "올리비아가 준비한 업무입니다.",
    clientName: row.client_name || undefined,
    projectName: row.project_name || undefined,
    workflowRunId: row.workflow_run_id || undefined,
    dueAt: row.due_at || undefined,
    status: row.status,
    availableActions: actions,
  };
}

function approvalItem(row: Record<string, any>): OliviaChatWorkItem {
  return {
    id: row.id,
    kind: "approval",
    title: row.title,
    summary: row.description || `${row.approval_type || "업무"} 승인이 필요합니다.`,
    clientName: row.client_name || undefined,
    projectName: row.project_name || undefined,
    workflowRunId: row.workflow_run_id || undefined,
    status: row.status,
    availableActions: row.status === "pending" ? ["view", "approve"] : ["view"],
  };
}

function commitmentItem(row: Record<string, any>): OliviaChatWorkItem {
  return {
    id: row.id,
    kind: "commitment",
    title: row.owner_type === "client" ? "고객 약속" : row.owner_type === "representative" ? "대표 약속" : "업무 약속",
    summary: row.commitment,
    clientName: row.client_name || undefined,
    projectName: row.project_name || undefined,
    workflowRunId: row.workflow_run_id || undefined,
    priorityScore: row.status === "overdue" ? 90 : 60,
    dueAt: row.due_at || undefined,
    status: row.status,
    availableActions: ["view", "complete"],
  };
}

function projectItem(row: Record<string, any>): OliviaChatWorkItem {
  return {
    id: row.id,
    kind: "project",
    title: row.project_name || row.client_name || "고객 프로젝트",
    summary: `${stepName(row.current_step_key)} · 다음 행동: ${row.next_action || "확인 필요"}`,
    clientName: row.client_name || undefined,
    projectName: row.project_name || undefined,
    workflowRunId: row.id,
    dueAt: row.next_action_due_at || row.shoot_date || undefined,
    status: row.status,
    availableActions: ["view"],
  };
}

function eventItem(row: Record<string, any>): OliviaChatWorkItem {
  return {
    id: row.id,
    kind: "event",
    title: String(row.event_type || "고객 반응").replace(/^client\./, "고객 ").replaceAll("_", " "),
    summary: String(row.payload?.summary || row.payload?.message || "새로운 고객 반응이 감지되었습니다."),
    workflowRunId: row.workflow_run_id || undefined,
    dueAt: row.occurred_at || undefined,
    status: row.event_status,
    availableActions: ["view"],
  };
}

async function hydrateWorkflowLabels(db: SupabaseClient, items: OliviaChatWorkItem[]) {
  const workflowRunIds = [...new Set(items.map((item) => item.workflowRunId).filter(Boolean))] as string[];
  if (!workflowRunIds.length) return { items, unavailable: false };
  const result = await safeQuery<any[]>(db.from("workflow_runs").select("id,client_name,project_name").in("id", workflowRunIds), []);
  const labels = new Map(result.data.map((run) => [run.id, run]));
  return {
    unavailable: result.unavailable,
    items: items.map((item) => {
      const run = item.workflowRunId ? labels.get(item.workflowRunId) : null;
      return run ? {
        ...item,
        clientName: item.clientName || run.client_name || undefined,
        projectName: item.projectName || run.project_name || undefined,
      } : item;
    }),
  };
}

function unavailableNote(count: number) {
  return count ? `\n\n일부 데이터 ${count}개 항목은 현재 연결되지 않아 조회 가능한 정보만 보여드렸어요.` : "";
}

async function getTodayBriefing(db: SupabaseClient): Promise<OliviaChatToolResult> {
  const now = new Date().toISOString();
  const [insights, actions, approvals, commitments, events, briefing] = await Promise.all([
    safeQuery<any[]>(db.from("olivia_insights").select("*").in("status", ["open", "acknowledged", "action_created"]).or(`snoozed_until.is.null,snoozed_until.lte.${now}`).order("priority_score", { ascending: false }).limit(12), []),
    safeQuery<any[]>(db.from("olivia_actions").select("*").in("status", ["waiting_approval", "approved", "suggested", "prepared"]).order("due_at", { ascending: true, nullsFirst: false }).limit(12), []),
    safeQuery<any[]>(db.from("agent_approvals").select("*").eq("status", "pending").order("created_at", { ascending: true }).limit(12), []),
    safeQuery<any[]>(db.from("meeting_commitments").select("*").in("status", ["open", "overdue"]).order("due_at", { ascending: true, nullsFirst: false }).limit(12), []),
    safeQuery<any[]>(db.from("olivia_events").select("*").like("event_type", "client.%").order("occurred_at", { ascending: false }).limit(8), []),
    safeQuery<any>(db.from("olivia_briefings").select("*").eq("briefing_type", "morning").order("briefing_date", { ascending: false }).limit(1).maybeSingle(), null),
  ]);
  const actionApprovalIds = new Set(actions.data.map((row) => row.approval_id).filter(Boolean));
  const baseItems = [
    ...insights.data.map(insightItem),
    ...actions.data.map(actionItem),
    ...approvals.data.filter((row) => !actionApprovalIds.has(row.id)).map(approvalItem),
    ...commitments.data.map(commitmentItem),
    ...events.data.map(eventItem),
  ];
  const hydrated = await hydrateWorkflowLabels(db, baseItems);
  const items = sortChatWorkItems(hydrated.items).slice(0, 12);
  const unavailable = [insights, actions, approvals, commitments, events, briefing].filter((result) => result.unavailable).length + Number(hydrated.unavailable);
  const urgent = items.filter((item) => (item.priorityScore || 0) >= 80).length;
  const pending = items.filter((item) => item.kind === "approval" || (item.kind === "action" && item.status === "waiting_approval")).length;
  const summary = briefing.data?.summary ? `\n${briefing.data.summary}` : "";
  return {
    action: "done",
    message: `오늘 확인할 업무를 정리했어요. 긴급 ${urgent}건, 승인 대기 ${pending}건, 전체 주요 항목 ${items.length}건입니다.${summary}${unavailableNote(unavailable)}`,
    workItems: items,
  };
}

async function getUrgentInsights(db: SupabaseClient, input: any): Promise<OliviaChatToolResult> {
  const minimum = Math.max(0, Math.min(100, Number(input.minimumScore ?? 80)));
  const result = await safeQuery<any[]>(db.from("olivia_insights").select("*").in("status", ["open", "acknowledged", "action_created"]).gte("priority_score", minimum).order("priority_score", { ascending: false }).limit(20), []);
  const hydrated = await hydrateWorkflowLabels(db, result.data.map(insightItem));
  return { action: "done", message: hydrated.items.length ? `${minimum}점 이상 긴급 인사이트 ${hydrated.items.length}건입니다.${unavailableNote(Number(result.unavailable) + Number(hydrated.unavailable))}` : "현재 기준에 해당하는 긴급 인사이트가 없습니다.", workItems: hydrated.items };
}

async function searchProjects(db: SupabaseClient, input: any): Promise<OliviaChatToolResult> {
  const keyword = String(input.query || input.clientName || "").trim().replace(/[,%()]/g, " ");
  if (!keyword) return { action: "done", message: "검색할 고객명 또는 프로젝트명을 알려주세요.", workItems: [] };
  let result = await safeQuery<any[]>(db.from("workflow_runs").select("*").or(`client_name.ilike.%${keyword}%,project_name.ilike.%${keyword}%`).order("updated_at", { ascending: false }).limit(10), []);
  // client_name/project_name 둘 다 대상이라 fuzzyNameSearch(단일 컬럼용)로는 못 돌리고,
  // 여기서만 직접 후보를 넓게 가져와 공백 무시 매칭한다 (list_mailing_queue의 커스텀 폴백과 동일한 방식).
  if (result.data.length === 0 && !result.unavailable) {
    const candidates = await safeQuery<any[]>(db.from("workflow_runs").select("*").order("updated_at", { ascending: false }).limit(500), []);
    const matched = candidates.data.filter((row) => fuzzyIncludes(row.client_name, keyword) || fuzzyIncludes(row.project_name, keyword)).slice(0, 10);
    if (matched.length > 0) result = { data: matched, unavailable: candidates.unavailable };
  }
  const items = result.data.map(projectItem);
  return { action: "done", message: items.length ? `“${keyword}” 관련 프로젝트 ${items.length}건을 찾았어요.${items.length > 1 ? " 정확한 항목을 선택해주세요." : ""}${unavailableNote(result.unavailable ? 1 : 0)}` : `“${keyword}” 관련 프로젝트를 찾지 못했어요.`, workItems: items };
}

async function getProjectStatus(db: SupabaseClient, input: any, toolContext: ToolContext): Promise<OliviaChatToolResult> {
  let workflowRunId = String(input.workflowRunId || "");
  if (!workflowRunId && Number.isInteger(input.referenceIndex)) {
    workflowRunId = resolveWorkItemReference(toolContext.recentWorkItems || [], null, Number(input.referenceIndex))?.workflowRunId || "";
  }
  if (!workflowRunId && input.clientName) {
    const search = await searchProjects(db, { query: input.clientName });
    if (search.workItems?.length !== 1) return search;
    workflowRunId = search.workItems[0].workflowRunId || "";
  }
  if (!workflowRunId) return { action: "done", message: "확인할 고객 또는 프로젝트를 선택해주세요.", workItems: [] };

  const context = await buildWorkflowContext(db, workflowRunId);
  const run = context.workflowRun;
  const project = projectItem(run);
  const items = sortChatWorkItems([
    project,
    ...context.approvals.filter((row) => row.status === "pending").map(approvalItem),
    ...context.commitments.filter((row) => ["open", "overdue"].includes(row.status)).map(commitmentItem),
  ]);
  const openInsights = await safeQuery<any[]>(db.from("olivia_insights").select("*").eq("workflow_run_id", workflowRunId).in("status", ["open", "acknowledged", "action_created"]).order("priority_score", { ascending: false }).limit(8), []);
  items.splice(1, 0, ...openInsights.data.map(insightItem));
  return {
    action: "done",
    message: `**${run.client_name || run.project_name || "프로젝트"}**는 현재 **${stepName(run.current_step_key)}** 단계입니다. 다음 행동은 “${run.next_action || "확인 필요"}”입니다.${unavailableNote(context.unavailableSources.length + (openInsights.unavailable ? 1 : 0))}`,
    workItems: items.slice(0, 12),
  };
}

async function checkRecentErrors(db: SupabaseClient, input: any): Promise<OliviaChatToolResult> {
  const sinceHours = Number.isFinite(Number(input?.sinceHours)) && Number(input?.sinceHours) > 0 ? Number(input.sinceHours) : 24;
  const sinceIso = new Date(Date.now() - sinceHours * 60 * 60_000).toISOString();

  const [failedLogs, failedTasks] = await Promise.all([
    safeQuery<any[]>(
      db.from("agent_logs").select("*").eq("success", false).gte("created_at", sinceIso).order("created_at", { ascending: false }).limit(20),
      [],
    ),
    safeQuery<any[]>(
      db.from("agent_tasks").select("*").eq("status", "failed").gte("updated_at", sinceIso).order("updated_at", { ascending: false }).limit(20),
      [],
    ),
  ]);

  const logLines = failedLogs.data.map((row) => {
    const who = clientName(row) || "시스템";
    const when = row.created_at ? new Date(row.created_at).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "";
    return `- [${when}] ${who} · ${row.log_type || "log"} · ${row.error_message || row.message || "오류 상세 없음"}`;
  });
  const taskLines = failedTasks.data.map((row) => {
    const when = row.updated_at ? new Date(row.updated_at).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "";
    return `- [${when}] ${row.title || row.task_type || "작업"} 실패 · ${row.error_message || "오류 상세 없음"}`;
  });

  const total = logLines.length + taskLines.length;
  const unavailable = Number(failedLogs.unavailable) + Number(failedTasks.unavailable);
  if (total === 0) {
    return { action: "done", message: `최근 ${sinceHours}시간 동안 자동화 오류나 실패한 작업이 없어요. 시스템이 정상 동작 중입니다.${unavailableNote(unavailable)}` };
  }

  const parts = [`최근 ${sinceHours}시간 동안 발견된 오류 ${total}건입니다.`];
  if (logLines.length) parts.push(`\n**실패한 자동화 로그 (${logLines.length}건)**\n${logLines.join("\n")}`);
  if (taskLines.length) parts.push(`\n**실패한 업무 (${taskLines.length}건)**\n${taskLines.join("\n")}`);
  return { action: "done", message: parts.join("\n") + unavailableNote(unavailable) };
}

// 대화에서 파악한 문제를 Claude Code/Codex 같은 개발 도구에 바로 붙여넣을 수 있는
// 구조화된 개발요청 스펙으로 정리한다. 최근 시스템 오류 로그가 있으면 근거로 함께 첨부한다.
async function generateDevRequest(db: SupabaseClient, input: any): Promise<OliviaChatToolResult> {
  const problemSummary = String(input?.problemSummary || "").trim();
  if (!problemSummary) throw new Error("어떤 문제인지 요약이 필요합니다.");

  const title = String(input?.title || "").trim() || problemSummary.split("\n")[0].slice(0, 60);
  const sinceHours = Number.isFinite(Number(input?.sinceHours)) && Number(input?.sinceHours) > 0 ? Number(input.sinceHours) : 24;
  const sinceIso = new Date(Date.now() - sinceHours * 60 * 60_000).toISOString();

  const [failedLogs, failedTasks] = await Promise.all([
    safeQuery<any[]>(
      db.from("agent_logs").select("*").eq("success", false).gte("created_at", sinceIso).order("created_at", { ascending: false }).limit(10),
      [],
    ),
    safeQuery<any[]>(
      db.from("agent_tasks").select("*").eq("status", "failed").gte("updated_at", sinceIso).order("updated_at", { ascending: false }).limit(10),
      [],
    ),
  ]);

  const evidenceLines = [
    ...failedLogs.data.map((row) => `- [${row.created_at ? new Date(row.created_at).toLocaleString("ko-KR") : "-"}] ${row.log_type || "log"} · ${row.error_message || row.message || "오류 상세 없음"}`),
    ...failedTasks.data.map((row) => `- [${row.updated_at ? new Date(row.updated_at).toLocaleString("ko-KR") : "-"}] ${row.title || row.task_type || "작업"} 실패 · ${row.error_message || "오류 상세 없음"}`),
  ];

  const steps = Array.isArray(input?.reproSteps) ? input.reproSteps.filter(Boolean).map(String) : [];
  const affectedArea = String(input?.affectedArea || "").trim();

  const specLines = [
    `# ${title}`,
    ``,
    `## 문제 설명`,
    problemSummary,
    ...(affectedArea ? [``, `## 영향 범위`, affectedArea] : []),
    ...(steps.length ? [``, `## 재현 방법`, ...steps.map((s, i) => `${i + 1}. ${s}`)] : []),
    ...(evidenceLines.length ? [``, `## 관련 오류 로그 (최근 ${sinceHours}시간)`, ...evidenceLines] : []),
    ``,
    `## 요청`,
    `위 문제의 원인을 코드에서 직접 확인하고 수정해줘.`,
  ];

  const spec = specLines.join("\n");
  const message = `아래 내용을 복사해서 Claude Code나 다른 개발 도구에 그대로 붙여넣으시면 됩니다.\n\n\`\`\`\n${spec}\n\`\`\``;
  return { action: "done", message };
}

async function listPendingApprovals(db: SupabaseClient): Promise<OliviaChatToolResult> {
  const [actions, approvals] = await Promise.all([
    safeQuery<any[]>(db.from("olivia_actions").select("*").eq("status", "waiting_approval").order("created_at", { ascending: true }).limit(20), []),
    safeQuery<any[]>(db.from("agent_approvals").select("*").eq("status", "pending").order("created_at", { ascending: true }).limit(20), []),
  ]);
  const actionApprovalIds = new Set(actions.data.map((row) => row.approval_id).filter(Boolean));
  const hydrated = await hydrateWorkflowLabels(db, [...actions.data.map(actionItem), ...approvals.data.filter((row) => !actionApprovalIds.has(row.id)).map(approvalItem)]);
  return { action: "done", message: hydrated.items.length ? `승인 대기 ${hydrated.items.length}건입니다.${unavailableNote(Number(actions.unavailable) + Number(approvals.unavailable) + Number(hydrated.unavailable))}` : "현재 승인 대기 항목이 없습니다.", workItems: hydrated.items };
}

async function listCommitments(db: SupabaseClient, input: any): Promise<OliviaChatToolResult> {
  let query = db.from("meeting_commitments").select("*").in("status", ["open", "overdue"]).order("due_at", { ascending: true, nullsFirst: false }).limit(30);
  if (input.ownerType) query = query.eq("owner_type", input.ownerType);
  const result = await safeQuery<any[]>(query, []);
  const hydrated = await hydrateWorkflowLabels(db, result.data.map(commitmentItem));
  const items = sortChatWorkItems(hydrated.items);
  return { action: "done", message: items.length ? `미완료 약속 ${items.length}건입니다.${unavailableNote(Number(result.unavailable) + Number(hydrated.unavailable))}` : "현재 미완료 약속이 없습니다.", workItems: items };
}

async function prepareFollowup(db: SupabaseClient, input: any, toolContext: ToolContext): Promise<OliviaChatToolResult> {
  let insightId = String(input.insightId || "");
  let workflowRunId = String(input.workflowRunId || "");
  if (Number.isInteger(input.referenceIndex)) {
    const reference = resolveWorkItemReference(toolContext.recentWorkItems || [], null, Number(input.referenceIndex));
    insightId ||= reference?.kind === "insight" ? reference.id : "";
    workflowRunId ||= reference?.workflowRunId || "";
  }
  let insight: any = null;
  if (insightId) {
    const result = await db.from("olivia_insights").select("*").eq("id", insightId).maybeSingle();
    insight = result.data;
    workflowRunId ||= insight?.workflow_run_id || "";
  }
  if (!workflowRunId) throw new Error("후속 연락을 준비할 프로젝트를 선택해주세요.");
  const context = await buildWorkflowContext(db, workflowRunId);
  if (!insight) {
    const deduplicationKey = `chat_followup:${workflowRunId}:${new Date().toISOString().slice(0, 10)}`;
    const row = {
      insight_type: "recommendation",
      title: `${context.workflowRun.client_name || "고객"} 후속 연락 준비`,
      summary: input.purpose || "현재 단계 확인을 위한 고객 후속 연락이 필요합니다.",
      reason: "올리비아 채팅에서 대표가 후속 연락 준비를 요청했습니다.",
      client_id: context.workflowRun.client_id,
      project_id: context.workflowRun.project_id,
      workflow_run_id: workflowRunId,
      priority_score: 60,
      urgency_score: 55,
      impact_score: 65,
      confidence: 1,
      recommended_action: "고객 후속 연락 초안",
      deduplication_key: deduplicationKey,
    };
    let inserted = await db.from("olivia_insights").insert(row).select("*").maybeSingle();
    if (inserted.error?.code === "23505") inserted = await db.from("olivia_insights").select("*").eq("deduplication_key", deduplicationKey).maybeSingle();
    if (inserted.error || !inserted.data) throw new Error(inserted.error?.message || "후속 연락 인사이트 생성 실패");
    insight = inserted.data;
  }
  const draft = String(input.draft || `${context.workflowRun.client_name || "고객"} 담당자님, 현재 ${stepName(context.workflowRun.current_step_key)} 진행 상황 확인 부탁드립니다.`);
  const action = await planOliviaAction(db, context, insight, {
    actionType: "create_followup_message",
    title: `${context.workflowRun.client_name || "고객"} 후속 연락`,
    description: draft,
    permissionLevel: "review_required",
    payload: { draft, purpose: input.purpose || "진행 상황 확인" },
  });
  const preparedItem = action ? {
    ...actionItem(action),
    clientName: context.workflowRun.client_name || undefined,
    projectName: context.workflowRun.project_name || undefined,
  } : null;
  const message = action?.status === "completed"
    ? "같은 후속 연락 준비가 이미 완료되어 기존 기록을 보여드릴게요."
    : "고객 후속 연락 초안을 준비하고 승인함에 등록했어요. 발송 전 내용을 확인해주세요.";
  return { action: "done", message, workItems: preparedItem ? [preparedItem] : [] };
}

async function manageWorkItem(db: SupabaseClient, input: any, toolContext: ToolContext): Promise<OliviaChatToolResult> {
  let itemId = String(input.itemId || input.actionId || "");
  let itemKind = String(input.itemKind || "action");
  if (!itemId && Number.isInteger(input.referenceIndex)) {
    const reference = resolveWorkItemReference(toolContext.recentWorkItems || [], null, Number(input.referenceIndex));
    itemId = reference?.id || "";
    itemKind = reference?.kind || itemKind;
  }
  if (!itemId) throw new Error("처리할 업무 항목을 선택해주세요.");
  const operation = String(input.operation || "");

  if (itemKind === "action") {
    const found = await db.from("olivia_actions").select("*").eq("id", itemId).maybeSingle();
    if (found.error || !found.data) throw new Error(found.error?.message || "Olivia 행동을 찾지 못했습니다.");
    let action = found.data;
    if (operation === "approve") {
      if (action.status !== "waiting_approval" || !action.approval_id) throw new Error("승인 대기 중인 행동만 승인할 수 있습니다.");
      await approveWorkflowItem(db, action.approval_id, input.memo || "Olivia 채팅 승인");
      action = (await db.from("olivia_actions").select("*").eq("id", itemId).single()).data;
    } else if (operation === "run") {
      if (action.permission_level !== "auto" && action.status !== "approved") throw new Error("대표 승인 후 실행할 수 있습니다.");
      const context = action.workflow_run_id ? await buildWorkflowContext(db, action.workflow_run_id) : undefined;
      action = await runOliviaAction(db, action, context);
    } else if (operation === "dismiss") {
      const updated = await db.from("olivia_actions").update({ status: "dismissed", error_message: input.reason || "채팅에서 무시" }).eq("id", itemId).in("status", ["suggested", "prepared", "waiting_approval", "approved"]).select("*").maybeSingle();
      if (updated.error || !updated.data) throw new Error(updated.error?.message || "무시할 수 없는 행동 상태입니다.");
      action = updated.data;
      await db.from("olivia_feedback").insert({ action_id: itemId, insight_id: action.insight_id, feedback_type: "dismissed", original_content: action, reason: input.reason || "채팅에서 무시" });
    } else throw new Error("지원하지 않는 행동 처리입니다.");
    const runMessage = action.action_type === "create_followup_message"
      ? "승인된 후속 연락을 메일링 초안으로 등록했습니다. 외부 발송 전 메일링함에서 최종 확인해주세요."
      : "승인된 행동을 실행했습니다.";
    return { action: "done", message: operation === "approve" ? "승인했습니다. 실행이 필요한 항목은 실행 버튼으로 이어서 처리할 수 있어요." : operation === "run" ? runMessage : "해당 제안을 무시 처리했습니다.", workItems: [actionItem(action)] };
  }

  if (itemKind === "approval" && operation === "approve") {
    const approval = await approveWorkflowItem(db, itemId, input.memo || "Olivia 채팅 승인");
    return { action: "done", message: "승인 항목을 처리했습니다.", workItems: [approvalItem(approval)] };
  }

  if (itemKind === "insight") {
    const patch = operation === "dismiss"
      ? { status: "dismissed", dismissed_reason: input.reason || "채팅에서 무시", resolved_at: new Date().toISOString() }
      : operation === "snooze"
        ? { snoozed_until: new Date(Date.now() + Math.min(Math.max(Number(input.hours) || 24, 1), 24 * 30) * 3_600_000).toISOString() }
        : operation === "acknowledge"
          ? { status: "acknowledged" }
          : null;
    if (!patch) throw new Error("지원하지 않는 인사이트 처리입니다.");
    const updated = await db.from("olivia_insights").update(patch).eq("id", itemId).select("*").maybeSingle();
    if (updated.error || !updated.data) throw new Error(updated.error?.message || "인사이트를 처리하지 못했습니다.");
    if (operation === "dismiss") {
      await Promise.all([
        db.from("olivia_actions").update({ status: "dismissed" }).eq("insight_id", itemId).in("status", ["suggested", "prepared"]),
        db.from("olivia_feedback").insert({ insight_id: itemId, feedback_type: "dismissed", original_content: updated.data, reason: input.reason || "채팅에서 무시" }),
      ]);
    } else if (operation === "snooze") {
      await db.from("olivia_feedback").insert({ insight_id: itemId, feedback_type: "snoozed", original_content: updated.data, edited_content: { snoozedUntil: (patch as any).snoozed_until } });
    }
    return { action: "done", message: operation === "snooze" ? "내일 다시 알려드릴게요." : operation === "dismiss" ? "인사이트를 무시 처리했습니다." : "확인한 항목으로 표시했습니다.", workItems: [insightItem(updated.data)] };
  }

  if (itemKind === "commitment" && operation === "complete") {
    const updated = await db.from("meeting_commitments").update({ status: "completed", completed_at: new Date().toISOString() }).eq("id", itemId).in("status", ["open", "overdue"]).select("*").maybeSingle();
    if (updated.error || !updated.data) throw new Error(updated.error?.message || "완료할 수 없는 약속입니다.");
    return { action: "done", message: "약속을 완료 처리했습니다.", workItems: [commitmentItem(updated.data)] };
  }
  throw new Error("현재 항목에서 지원하지 않는 처리입니다.");
}

async function runObserver(db: SupabaseClient, input: any): Promise<OliviaChatToolResult> {
  const result = await runOliviaObserver(db, { workflowRunId: input.workflowRunId, mode: input.workflowRunId ? "single" : "all_active", limit: 30 });
  await emitOliviaEventSafely(db, {
    eventType: "assistant.observer_requested",
    eventSource: "olivia_chat",
    workflowRunId: input.workflowRunId || null,
    actorType: "admin",
    payload: { checkedRuns: result.checkedRuns, createdInsights: result.createdInsights, createdActions: result.createdActions },
    deduplicationKey: createEventDeduplicationKey("assistant.observer_requested", input.workflowRunId || "all", new Date().toISOString().slice(0, 13)),
  });
  return { action: "done", message: `업무 상태를 다시 확인했어요. 프로젝트 ${result.checkedRuns}건을 점검해 인사이트 ${result.createdInsights}건, 준비 행동 ${result.createdActions}건을 반영했습니다.` };
}

async function runMeetingTool(db: SupabaseClient, name: string, input: any): Promise<OliviaChatToolResult> {
  if (name === "list_upcoming_meetings") {
    const meetings = await listUpcomingMeetings(db, input);
    const workItems = meetings.flatMap((meeting) => [meetingCandidateToWorkItem(meeting), ...meetingCandidateSelectionItems(meeting)]);
    return { action: "done", message: workItems.length ? `고객 미팅 ${workItems.length}건을 찾았어요. 미팅 전 브리핑을 바로 준비할 수 있습니다.` : "조회 기간에 예정된 고객 미팅이 없습니다.", workItems };
  }
  if (name === "link_meeting_client") {
    const candidate = await linkMeetingClient(db, String(input.calendarTaskId || ""), String(input.workflowRunId || ""));
    return { action: "done", message: "미팅 일정과 고객 프로젝트를 연결했습니다.", workItems: [meetingCandidateToWorkItem(candidate)] };
  }
  if (name === "prepare_meeting_brief") {
    const result = await prepareMeetingBriefing(db, { calendarTaskId: String(input.calendarTaskId || ""), workflowRunId: input.workflowRunId ? String(input.workflowRunId) : undefined });
    if (result.requiresConnection) return { action: "done", message: "미팅과 연결할 고객 프로젝트를 먼저 선택해주세요.", workItems: [meetingCandidateToWorkItem(result.candidate)] };
    return { action: "done", message: `${result.briefing.title}을 준비했습니다. 열린 약속과 이번 미팅의 확인 질문을 함께 정리했어요.`, workItems: [meetingCandidateToWorkItem(result.candidate)] };
  }
  if (name === "analyze_meeting_memo") {
    const memoId = String(input.memoId || "");
    if (!memoId) {
      const workItems = await listMeetingMemos(db, { calendarTaskId: input.calendarTaskId, workflowRunId: input.workflowRunId });
      return { action: "done", message: workItems.length ? "분석할 미팅 메모를 선택해주세요." : "연결된 고객의 미팅 메모를 찾지 못했습니다.", workItems };
    }
    const result = await analyzeMeetingMemo(db, { memoId, workflowRunId: input.workflowRunId, calendarTaskId: input.calendarTaskId });
    const workItems = input.workflowRunId ? await getMeetingFollowups(db, String(input.workflowRunId)) : [];
    return { action: "done", message: `미팅 메모 분석을 완료했습니다. 약속 ${result.commitments.length}건과 후속 업무 ${result.createdTasks.length}건을 반영했어요.`, workItems };
  }
  if (name === "complete_meeting") {
    await completeMeeting(db, String(input.calendarTaskId || ""));
    const workItems = await listMeetingMemos(db, { calendarTaskId: input.calendarTaskId, workflowRunId: input.workflowRunId });
    return { action: "done", message: workItems.length ? "미팅을 완료 처리했습니다. 이어서 분석할 메모를 선택해주세요." : "미팅을 완료 처리했습니다. 메모를 작성하면 후속 분석을 이어갈 수 있어요.", workItems };
  }
  const workItems = await getMeetingFollowups(db, String(input.workflowRunId || ""));
  return { action: "done", message: workItems.length ? `미팅 후속 항목 ${workItems.length}건입니다.` : "현재 남은 미팅 후속 항목이 없습니다.", workItems };
}

export async function executeOliviaChatWorkTool(
  db: SupabaseClient,
  name: string,
  input: any,
  toolContext: ToolContext = {},
): Promise<OliviaChatToolResult> {
  if (name === "get_today_briefing") return getTodayBriefing(db);
  if (name === "get_urgent_insights") return getUrgentInsights(db, input);
  if (name === "search_client_projects") return searchProjects(db, input);
  if (name === "get_project_status") return getProjectStatus(db, input, toolContext);
  if (name === "list_pending_approvals") return listPendingApprovals(db);
  if (name === "list_commitments") return listCommitments(db, input);
  if (name === "prepare_followup") return prepareFollowup(db, input, toolContext);
  if (name === "manage_olivia_action") return manageWorkItem(db, input, toolContext);
  if (name === "run_observer") return runObserver(db, input);
  if (["list_upcoming_meetings", "link_meeting_client", "prepare_meeting_brief", "analyze_meeting_memo", "complete_meeting", "get_meeting_followups"].includes(name)) return runMeetingTool(db, name, input);
  if (name === "check_recent_errors") return checkRecentErrors(db, input);
  if (name === "generate_dev_request") return generateDevRequest(db, input);
  throw new Error(`지원하지 않는 Olivia 업무 도구입니다: ${name}`);
}
