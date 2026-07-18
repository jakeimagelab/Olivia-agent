import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { WORKFLOW_STEPS } from "@/lib/workflow";
import { createStepTasks } from "@/lib/workflowAutomation";
import { planOliviaAction } from "@/lib/olivia/actionPlanner";
import { getKstDate } from "@/lib/olivia/briefings";
import { saveMeetingCommitments } from "@/lib/olivia/commitments";
import { buildWorkflowContext } from "@/lib/olivia/context";
import { createEventDeduplicationKey, emitOliviaEventSafely } from "@/lib/olivia/events";
import type { OliviaChatWorkItem } from "@/lib/olivia/chatTypes";

type CalendarTask = Record<string, any>;
type WorkflowRun = Record<string, any>;

export type MeetingCandidate = {
  task: CalendarTask;
  workflowRun: WorkflowRun | null;
  matchingRuns: WorkflowRun[];
  connectionStatus: "linked" | "inferred" | "ambiguous" | "unlinked";
};

type MeetingAnalysis = {
  summary: string;
  customerNeeds: string[];
  confirmedItems: string[];
  unresolvedItems: string[];
  representativeCommitments: Array<{ text: string; dueAt?: string; ownerName?: string }>;
  clientCommitments: Array<{ text: string; dueAt?: string; ownerName?: string }>;
  objections: string[];
  budget?: string;
  desiredSchedule?: string;
  decisionMaker?: string;
  recommendedPackage?: string;
  nextAction?: string;
  confidence: number;
};

function normalizeText(value: unknown) {
  return String(value || "").toLocaleLowerCase("ko-KR").replace(/[^0-9a-z가-힣]/g, "");
}

function outputText(json: any): string {
  if (typeof json.output_text === "string") return json.output_text;
  for (const item of json.output ?? []) {
    for (const part of item.content ?? []) if (typeof part.text === "string") return part.text;
  }
  return "";
}

export function isCustomerMeeting(task: CalendarTask) {
  if (task.category === "client") return true;
  const text = `${task.title || ""} ${task.memo || ""}`;
  return /(고객|클라이언트|병원|의원|미팅|상담|회의)/.test(text) && task.category !== "personal";
}

export function getMeetingDateRange(input: { from?: string; to?: string; days?: number } = {}, now = new Date()) {
  const from = input.from || getKstDate(now);
  if (input.to) return { from, to: input.to };
  const end = new Date(`${from}T00:00:00+09:00`);
  end.setDate(end.getDate() + Math.max(0, Math.min(Number(input.days ?? 2) - 1, 30)));
  return { from, to: getKstDate(end) };
}

export function createMeetingBriefingKey(calendarTaskId: string, workflowRunId: string, meetingDate: string) {
  return `meeting_pre:${calendarTaskId}:${workflowRunId}:${meetingDate}`;
}

export function canApplyAiNextAction(run: WorkflowRun) {
  return !String(run.next_action || "").trim() || run.next_action_source === "ai";
}

export function findMatchingWorkflowRuns(task: CalendarTask, runs: WorkflowRun[]): MeetingCandidate {
  const context = task.meeting_context && typeof task.meeting_context === "object" ? task.meeting_context : {};
  const linkedRunId = String(context.workflowRunId || "");
  if (linkedRunId) {
    const linked = runs.find((run) => run.id === linkedRunId) || null;
    return { task, workflowRun: linked, matchingRuns: linked ? [linked] : [], connectionStatus: linked ? "linked" : "unlinked" };
  }
  const linkedClientId = String(context.clientId || "");
  if (linkedClientId) {
    const matches = runs.filter((run) => run.client_id === linkedClientId);
    return { task, workflowRun: matches.length === 1 ? matches[0] : null, matchingRuns: matches, connectionStatus: matches.length === 1 ? "linked" : matches.length > 1 ? "ambiguous" : "unlinked" };
  }
  const haystack = normalizeText(`${task.title || ""} ${task.memo || ""}`);
  const matches = runs.filter((run) => {
    const name = normalizeText(run.client_name);
    return name.length >= 2 && haystack.includes(name);
  });
  return {
    task,
    workflowRun: matches.length === 1 ? matches[0] : null,
    matchingRuns: matches,
    connectionStatus: matches.length === 1 ? "inferred" : matches.length > 1 ? "ambiguous" : "unlinked",
  };
}

function meetingDueAt(task: CalendarTask) {
  const time = /^\d{2}:\d{2}/.test(String(task.time || "")) ? String(task.time).slice(0, 5) : "09:00";
  const value = `${task.date}T${time}:00+09:00`;
  return Number.isNaN(new Date(value).getTime()) ? undefined : new Date(value).toISOString();
}

export function meetingCandidateToWorkItem(candidate: MeetingCandidate): OliviaChatWorkItem {
  const run = candidate.workflowRun;
  const statusText = candidate.connectionStatus === "linked" ? "고객 연결됨" : candidate.connectionStatus === "inferred" ? "고객 연결 후보" : candidate.connectionStatus === "ambiguous" ? "고객 선택 필요" : "고객 미연결";
  const actions: OliviaChatWorkItem["availableActions"] = ["view"];
  if (run) actions.push("brief");
  if (run && candidate.connectionStatus === "inferred") actions.push("link");
  if (!candidate.task.completed) actions.push("complete");
  if (run) actions.push("analyze", "followups");
  return {
    id: candidate.task.id,
    kind: "meeting",
    title: candidate.task.title,
    summary: `${candidate.task.date}${candidate.task.time ? ` ${candidate.task.time}` : ""}${candidate.task.location ? ` · ${candidate.task.location}` : ""} · ${statusText}`,
    clientName: run?.client_name || undefined,
    projectName: run?.project_name || undefined,
    workflowRunId: run?.id || undefined,
    dueAt: meetingDueAt(candidate.task),
    status: candidate.task.completed ? "completed" : String(candidate.task.meeting_context?.meetingStatus || "scheduled"),
    reason: candidate.connectionStatus === "ambiguous" ? `일치하는 프로젝트 ${candidate.matchingRuns.length}건 중 선택이 필요합니다.` : undefined,
    metadata: {
      calendarTaskId: candidate.task.id,
      location: candidate.task.location || "",
      connectionStatus: candidate.connectionStatus,
      matchingWorkflowRunIds: candidate.matchingRuns.map((item) => item.id),
      memoId: candidate.task.meeting_context?.memoId || null,
    },
    availableActions: actions,
  };
}

export function meetingCandidateSelectionItems(candidate: MeetingCandidate): OliviaChatWorkItem[] {
  if (candidate.connectionStatus !== "ambiguous") return [];
  return candidate.matchingRuns.map((run) => ({
    id: run.id,
    kind: "project",
    title: run.project_name || run.client_name || "고객 프로젝트",
    summary: `${run.client_name || "고객"} · ${WORKFLOW_STEPS.find((step) => step.key === run.current_step_key)?.name || run.current_step_key || "진행 단계 확인"}`,
    clientName: run.client_name || undefined,
    projectName: run.project_name || undefined,
    workflowRunId: run.id,
    status: run.status,
    metadata: { calendarTaskId: candidate.task.id, connectionStatus: "selection" },
    availableActions: ["view", "link"],
  }));
}

async function safeCalendarTasks(db: SupabaseClient, from: string, to: string) {
  const result = await db.from("calendar_tasks").select("*").gte("date", from).lte("date", to).order("date").order("time", { ascending: true, nullsFirst: false });
  if (result.error) throw new Error(result.error.message);
  return result.data ?? [];
}

export async function listUpcomingMeetings(db: SupabaseClient, input: { from?: string; to?: string; days?: number; query?: string } = {}) {
  const range = getMeetingDateRange(input);
  const [tasks, runsResult] = await Promise.all([
    safeCalendarTasks(db, range.from, range.to),
    db.from("workflow_runs").select("*").eq("status", "active").order("updated_at", { ascending: false }).limit(200),
  ]);
  if (runsResult.error) throw new Error(runsResult.error.message);
  const query = normalizeText(input.query);
  const meetings = tasks.filter(isCustomerMeeting).filter((task) => !query || normalizeText(`${task.title} ${task.memo}`).includes(query));
  return meetings.map((task) => findMatchingWorkflowRuns(task, runsResult.data ?? []));
}

async function getMeetingCandidate(db: SupabaseClient, calendarTaskId: string) {
  const taskResult = await db.from("calendar_tasks").select("*").eq("id", calendarTaskId).maybeSingle();
  if (taskResult.error || !taskResult.data) throw new Error(taskResult.error?.message || "미팅 일정을 찾지 못했습니다.");
  const runsResult = await db.from("workflow_runs").select("*").eq("status", "active").order("updated_at", { ascending: false }).limit(200);
  if (runsResult.error) throw new Error(runsResult.error.message);
  return findMatchingWorkflowRuns(taskResult.data, runsResult.data ?? []);
}

export async function linkMeetingClient(db: SupabaseClient, calendarTaskId: string, workflowRunId: string) {
  const runResult = await db.from("workflow_runs").select("*").eq("id", workflowRunId).maybeSingle();
  if (runResult.error || !runResult.data) throw new Error(runResult.error?.message || "연결할 프로젝트를 찾지 못했습니다.");
  const taskResult = await db.from("calendar_tasks").select("meeting_context").eq("id", calendarTaskId).maybeSingle();
  const current = taskResult.data?.meeting_context && typeof taskResult.data.meeting_context === "object" ? taskResult.data.meeting_context : {};
  const meetingContext = { ...current, clientId: runResult.data.client_id || null, workflowRunId, meetingStatus: current.meetingStatus || "scheduled" };
  const updated = await db.from("calendar_tasks").update({ meeting_context: meetingContext }).eq("id", calendarTaskId).select("*").single();
  if (updated.error) throw new Error(updated.error.message);
  await emitOliviaEventSafely(db, {
    eventType: "meeting.client_linked",
    eventSource: "olivia_meeting_assistant",
    clientId: runResult.data.client_id,
    projectId: runResult.data.project_id,
    workflowRunId,
    actorType: "admin",
    payload: { calendarTaskId },
    deduplicationKey: createEventDeduplicationKey("meeting.client_linked", calendarTaskId, workflowRunId),
  });
  return findMatchingWorkflowRuns(updated.data, [runResult.data]);
}

function extractedQuestions(context: Awaited<ReturnType<typeof buildWorkflowContext>>) {
  const latestMemo = context.consultationMemos[0] || null;
  const extracted = latestMemo?.extracted_data && typeof latestMemo.extracted_data === "object" ? latestMemo.extracted_data : {};
  return [
    ...(Array.isArray(extracted.unresolvedItems) ? extracted.unresolvedItems.map((text: string) => ({ text })) : []),
    ...(!extracted.decisionMaker ? [{ text: "최종 의사결정권자를 확인하세요." }] : []),
    ...(!extracted.desiredSchedule ? [{ text: "희망 촬영 일정을 확인하세요." }] : []),
  ];
}

async function saveMeetingBriefing(db: SupabaseClient, row: Record<string, any>, deduplicationKey: string) {
  let result = await db.from("olivia_briefings").upsert({ ...row, deduplication_key: deduplicationKey }, { onConflict: "deduplication_key" }).select("*").single();
  if (result.error && /deduplication_key|calendar_task_id|workflow_run_id|column/i.test(result.error.message)) {
    const fallbackRow: Record<string, any> = { ...row, deduplication_key: deduplicationKey };
    const { deduplication_key: _dedupe, calendar_task_id: _calendar, workflow_run_id: _workflow, ...fallback } = fallbackRow;
    result = await db.from("olivia_briefings").upsert(fallback, { onConflict: "briefing_type,briefing_date,title" }).select("*").single();
  }
  if (result.error || !result.data) throw new Error(result.error?.message || "미팅 브리핑 저장 실패");
  return result.data;
}

export async function prepareMeetingBriefing(db: SupabaseClient, input: { calendarTaskId: string; workflowRunId?: string }) {
  let candidate = await getMeetingCandidate(db, input.calendarTaskId);
  const workflowRunId = input.workflowRunId || candidate.workflowRun?.id;
  if (!workflowRunId) return { briefing: null, candidate, requiresConnection: true };
  if (candidate.connectionStatus !== "linked") candidate = await linkMeetingClient(db, input.calendarTaskId, workflowRunId);
  const context = await buildWorkflowContext(db, workflowRunId);
  const run = context.workflowRun;
  const hospitalName = run.client_name || context.client?.name || "고객";
  const questions = extractedQuestions(context);
  const sections = [
    { key: "client", title: "고객과 프로젝트", items: [{ hospitalName, projectName: run.project_name || "확인 필요", manager: run.manager_name || context.client?.manager_name || "확인 필요" }] },
    { key: "workflow", title: "현재 진행 상태", items: [{ currentStep: WORKFLOW_STEPS.find((step) => step.key === run.current_step_key)?.name || run.current_step_key, nextAction: run.next_action || "확인 필요" }] },
    { key: "recent_consultation", title: "이전 논의", items: context.consultationMemos.slice(0, 3).map((memo) => ({ summary: memo.summary || "요약 확인 필요", nextAction: memo.next_action || "" })) },
    { key: "commitments", title: "열린 약속", items: context.commitments.filter((item) => ["open", "overdue"].includes(item.status)) },
    { key: "approvals", title: "승인 대기", items: context.approvals.filter((item) => item.status === "pending") },
    { key: "questions", title: "이번 미팅에서 확인할 질문", items: questions.length ? questions : [{ text: "현재 단계의 다음 행동과 담당자를 확인하세요." }] },
  ];
  const deduplicationKey = createMeetingBriefingKey(candidate.task.id, workflowRunId, candidate.task.date);
  const briefing = await saveMeetingBriefing(db, {
    briefing_type: "meeting_pre",
    briefing_date: candidate.task.date,
    title: `${hospitalName} 미팅 전 브리핑`,
    summary: `${hospitalName} 미팅 전에 확인 질문 ${questions.length || 1}개와 열린 약속 ${sections[3].items.length}건을 확인하세요.`,
    sections,
    source_data: { calendarTaskId: candidate.task.id, clientId: run.client_id || null, workflowRunId, meetingAt: meetingDueAt(candidate.task) || null },
    status: "generated",
    generated_at: new Date().toISOString(),
    calendar_task_id: candidate.task.id,
    workflow_run_id: workflowRunId,
  }, deduplicationKey);
  const current = candidate.task.meeting_context || {};
  await db.from("calendar_tasks").update({ meeting_context: { ...current, clientId: run.client_id || null, workflowRunId, briefingId: briefing.id, meetingStatus: "prepared" } }).eq("id", candidate.task.id);
  await emitOliviaEventSafely(db, {
    eventType: "meeting.pre_brief_generated",
    eventSource: "olivia_meeting_assistant",
    clientId: run.client_id,
    projectId: run.project_id,
    workflowRunId,
    actorType: "admin",
    payload: { calendarTaskId: candidate.task.id, briefingId: briefing.id, questionCount: questions.length || 1 },
    deduplicationKey: createEventDeduplicationKey("meeting.pre_brief_generated", deduplicationKey),
  });
  return { briefing, candidate, requiresConnection: false };
}

export async function listMeetingMemos(db: SupabaseClient, input: { calendarTaskId?: string; workflowRunId?: string }) {
  let workflowRunId = input.workflowRunId || "";
  if (!workflowRunId && input.calendarTaskId) workflowRunId = (await getMeetingCandidate(db, input.calendarTaskId)).workflowRun?.id || "";
  if (!workflowRunId) return [];
  const runResult = await db.from("workflow_runs").select("id,client_id,client_name,project_name").eq("id", workflowRunId).maybeSingle();
  if (runResult.error || !runResult.data?.client_id) return [];
  const run = runResult.data;
  const memosResult = await db.from("consultation_memos").select("id,title,summary,raw_memo,transcript,extracted_data,created_at").eq("hospital_id", run.client_id).order("created_at", { ascending: false }).limit(10);
  if (memosResult.error) throw new Error(memosResult.error.message);
  return (memosResult.data ?? []).map((memo): OliviaChatWorkItem => ({
    id: memo.id,
    kind: "memo",
    title: memo.title || memo.summary || "미팅 메모",
    summary: memo.summary || String(memo.raw_memo || memo.transcript || "메모 내용 확인").slice(0, 180),
    clientName: run.client_name || undefined,
    projectName: run.project_name || undefined,
    workflowRunId,
    dueAt: memo.created_at,
    status: Object.keys(memo.extracted_data || {}).length ? "analyzed" : "ready",
    metadata: { calendarTaskId: input.calendarTaskId || null, memoId: memo.id },
    availableActions: ["view", "analyze"],
  }));
}

async function analyzeMeetingText(rawText: string): Promise<MeetingAnalysis> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY 미설정");
  const schema = {
    type: "object", additionalProperties: false,
    properties: {
      summary: { type: "string" },
      customerNeeds: { type: "array", items: { type: "string" } },
      confirmedItems: { type: "array", items: { type: "string" } },
      unresolvedItems: { type: "array", items: { type: "string" } },
      representativeCommitments: { type: "array", items: { type: "object", additionalProperties: false, properties: { text: { type: "string" }, dueAt: { type: "string" }, ownerName: { type: "string" } }, required: ["text", "dueAt", "ownerName"] } },
      clientCommitments: { type: "array", items: { type: "object", additionalProperties: false, properties: { text: { type: "string" }, dueAt: { type: "string" }, ownerName: { type: "string" } }, required: ["text", "dueAt", "ownerName"] } },
      objections: { type: "array", items: { type: "string" } },
      budget: { type: "string" }, desiredSchedule: { type: "string" }, decisionMaker: { type: "string" }, recommendedPackage: { type: "string" }, nextAction: { type: "string" }, confidence: { type: "number" },
    },
    required: ["summary", "customerNeeds", "confirmedItems", "unresolvedItems", "representativeCommitments", "clientCommitments", "objections", "budget", "desiredSchedule", "decisionMaker", "recommendedPackage", "nextAction", "confidence"],
  };
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: process.env.OPENAI_MEMO_MODEL || "gpt-4.1-mini",
      instructions: "포토클리닉 고객 미팅 메모에서 확인된 사실만 구조화하세요. 근거가 없으면 빈 문자열 또는 빈 배열을 사용하고 약속의 기한은 가능한 경우에만 ISO 형식으로 작성하세요.",
      input: rawText.slice(0, 120_000),
      text: { format: { type: "json_schema", name: "meeting_post_analysis", strict: true, schema } },
    }),
  });
  const json = await response.json();
  if (!response.ok) throw new Error(json.error?.message || "미팅 메모 분석 실패");
  const text = outputText(json);
  if (!text) throw new Error("미팅 분석 응답 없음");
  return JSON.parse(text) as MeetingAnalysis;
}

function hasStructuredAnalysis(value: unknown): value is MeetingAnalysis {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return Array.isArray(record.confirmedItems) || Array.isArray(record.unresolvedItems) || Array.isArray(record.representativeCommitments);
}

async function createMeetingFollowupAction(db: SupabaseClient, context: Awaited<ReturnType<typeof buildWorkflowContext>>, analysis: MeetingAnalysis, memoId: string) {
  if (!analysis.unresolvedItems.length) return null;
  const deduplicationKey = `meeting_followup:${memoId}`;
  const row = {
    insight_type: "recommendation",
    title: `${context.workflowRun.client_name || "고객"} 미팅 후 확인`,
    summary: `미확인 항목 ${analysis.unresolvedItems.length}건에 대한 고객 확인이 필요합니다.`,
    reason: "미팅 후 분석에서 미확정 항목이 발견되었습니다.",
    client_id: context.workflowRun.client_id,
    project_id: context.workflowRun.project_id,
    workflow_run_id: context.workflowRun.id,
    priority_score: 65,
    urgency_score: 55,
    impact_score: 70,
    confidence: analysis.confidence || 0.8,
    recommended_action: "고객 확인 메시지 초안",
    deduplication_key: deduplicationKey,
  };
  let saved = await db.from("olivia_insights").insert(row).select("*").maybeSingle();
  if (saved.error?.code === "23505") saved = await db.from("olivia_insights").select("*").eq("deduplication_key", deduplicationKey).maybeSingle();
  if (saved.error || !saved.data) return null;
  return planOliviaAction(db, context, saved.data, {
    actionType: "create_followup_message",
    title: `${context.workflowRun.client_name || "고객"} 미팅 후 확인`,
    description: `안녕하세요. 오늘 미팅에서 논의한 ${analysis.unresolvedItems.join(", ")} 항목을 확인 부탁드립니다.`,
    permissionLevel: "review_required",
    payload: { draft: `안녕하세요. 오늘 미팅에서 논의한 ${analysis.unresolvedItems.join(", ")} 항목을 확인 부탁드립니다.`, memoId },
  });
}

export async function analyzeMeetingMemo(db: SupabaseClient, input: { memoId: string; workflowRunId?: string; calendarTaskId?: string }) {
  const memoResult = await db.from("consultation_memos").select("*").eq("id", input.memoId).maybeSingle();
  if (memoResult.error || !memoResult.data) throw new Error(memoResult.error?.message || "미팅 메모를 찾지 못했습니다.");
  const memo = memoResult.data;
  let workflowRunId = input.workflowRunId || "";
  if (!workflowRunId && input.calendarTaskId) workflowRunId = (await getMeetingCandidate(db, input.calendarTaskId)).workflowRun?.id || "";
  if (!workflowRunId && memo.hospital_id) {
    const run = await db.from("workflow_runs").select("id").eq("client_id", memo.hospital_id).eq("status", "active").order("updated_at", { ascending: false }).limit(1).maybeSingle();
    workflowRunId = run.data?.id || "";
  }
  if (!workflowRunId) throw new Error("메모를 연결할 활성 프로젝트를 선택해주세요.");
  const context = await buildWorkflowContext(db, workflowRunId);
  const rawText = [memo.raw_memo, memo.transcript, memo.audio_summary].filter(Boolean).join("\n\n");
  if (!rawText.trim() && !hasStructuredAnalysis(memo.extracted_data)) throw new Error("분석할 메모 내용이 없습니다.");
  const rawAnalysis = hasStructuredAnalysis(memo.extracted_data) ? memo.extracted_data as MeetingAnalysis : await analyzeMeetingText(rawText);
  const analysis: MeetingAnalysis = {
    ...rawAnalysis,
    summary: String(rawAnalysis.summary || memo.summary || ""),
    customerNeeds: Array.isArray(rawAnalysis.customerNeeds) ? rawAnalysis.customerNeeds : [],
    confirmedItems: Array.isArray(rawAnalysis.confirmedItems) ? rawAnalysis.confirmedItems : [],
    unresolvedItems: Array.isArray(rawAnalysis.unresolvedItems) ? rawAnalysis.unresolvedItems : [],
    representativeCommitments: Array.isArray(rawAnalysis.representativeCommitments) ? rawAnalysis.representativeCommitments : [],
    clientCommitments: Array.isArray(rawAnalysis.clientCommitments) ? rawAnalysis.clientCommitments : [],
    objections: Array.isArray(rawAnalysis.objections) ? rawAnalysis.objections : [],
    confidence: Number(rawAnalysis.confidence || 0.8),
  };
  await db.from("consultation_memos").update({
    summary: analysis.summary || memo.summary || "",
    extracted_data: analysis,
    recommended_package: analysis.recommendedPackage || memo.recommended_package || "",
    next_action: analysis.nextAction || memo.next_action || "",
  }).eq("id", memo.id);
  const commitments = await saveMeetingCommitments(db, analysis, {
    memoId: memo.id,
    clientId: context.workflowRun.client_id || memo.hospital_id || null,
    projectId: context.workflowRun.project_id,
    workflowRunId,
  });
  const nextAction = String(analysis.nextAction || "").trim();
  const run = context.workflowRun;
  if (nextAction && canApplyAiNextAction(run)) {
    await db.from("workflow_runs").update({ next_action: nextAction, next_action_source: "ai", next_action_updated_at: new Date().toISOString() }).eq("id", workflowRunId);
  }
  let createdTasks: any[] = [];
  if (run.current_step_key === "quote") createdTasks = (await createStepTasks(db, workflowRunId, "quote")).created;
  const followupAction = await createMeetingFollowupAction(db, context, analysis, memo.id);
  const title = `${run.client_name || "고객"} 미팅 후 브리핑`;
  const briefing = await saveMeetingBriefing(db, {
    briefing_type: "meeting_post",
    briefing_date: getKstDate(),
    title,
    summary: analysis.summary || `${run.client_name || "고객"} 미팅 분석을 완료했습니다.`,
    sections: [
      { key: "needs", title: "고객 요구사항", items: analysis.customerNeeds },
      { key: "confirmed", title: "확정 사항", items: analysis.confirmedItems },
      { key: "unresolved", title: "미확인 사항", items: analysis.unresolvedItems },
      { key: "commitments", title: "약속", items: commitments },
      { key: "objections", title: "고객 우려", items: analysis.objections },
      { key: "next_action", title: "다음 행동", items: nextAction ? [nextAction] : ["확인 필요"] },
    ],
    source_data: { memoId: memo.id, calendarTaskId: input.calendarTaskId || null, clientId: run.client_id || null, workflowRunId },
    status: "generated",
    generated_at: new Date().toISOString(),
    calendar_task_id: input.calendarTaskId || null,
    workflow_run_id: workflowRunId,
  }, `meeting_post:${memo.id}:${workflowRunId}`);
  if (input.calendarTaskId) {
    const task = await db.from("calendar_tasks").select("meeting_context").eq("id", input.calendarTaskId).maybeSingle();
    await db.from("calendar_tasks").update({ meeting_context: { ...(task.data?.meeting_context || {}), memoId: memo.id, meetingStatus: "analyzed" } }).eq("id", input.calendarTaskId);
  }
  await emitOliviaEventSafely(db, {
    eventType: "meeting.analyzed",
    eventSource: "olivia_meeting_assistant",
    clientId: run.client_id,
    projectId: run.project_id,
    workflowRunId,
    actorType: "admin",
    payload: { memoId: memo.id, calendarTaskId: input.calendarTaskId || null, commitmentCount: commitments.length, unresolvedItemCount: analysis.unresolvedItems.length, createdTaskCount: createdTasks.length },
    deduplicationKey: createEventDeduplicationKey("meeting.analyzed", memo.id),
  });
  return { analysis, briefing, commitments, createdTasks, followupAction };
}

export async function completeMeeting(db: SupabaseClient, calendarTaskId: string) {
  const candidate = await getMeetingCandidate(db, calendarTaskId);
  const current = candidate.task.meeting_context || {};
  let result = await db.from("calendar_tasks").update({ completed: true, meeting_context: { ...current, meetingStatus: "completed" } }).eq("id", calendarTaskId).select("*").single();
  if (result.error && /meeting_context|column/i.test(result.error.message)) result = await db.from("calendar_tasks").update({ completed: true }).eq("id", calendarTaskId).select("*").single();
  if (result.error) throw new Error(result.error.message);
  return result.data;
}

export async function getMeetingFollowups(db: SupabaseClient, workflowRunId: string) {
  const [commitments, tasks, actions] = await Promise.all([
    db.from("meeting_commitments").select("*").eq("workflow_run_id", workflowRunId).in("status", ["open", "overdue"]).order("due_at"),
    db.from("agent_tasks").select("*").eq("workflow_run_id", workflowRunId).in("status", ["pending", "failed", "waiting_approval"]).order("created_at", { ascending: false }).limit(20),
    db.from("olivia_actions").select("*").eq("workflow_run_id", workflowRunId).in("status", ["suggested", "prepared", "waiting_approval", "approved"]).order("created_at", { ascending: false }).limit(20),
  ]);
  const workItems: OliviaChatWorkItem[] = [
    ...(commitments.data ?? []).map((item): OliviaChatWorkItem => ({ id: item.id, kind: "commitment", title: item.owner_type === "client" ? "고객 약속" : "대표 약속", summary: item.commitment, workflowRunId, dueAt: item.due_at || undefined, status: item.status, availableActions: ["view", "complete"] })),
    ...(tasks.data ?? []).map((item): OliviaChatWorkItem => ({ id: item.id, kind: "action", title: item.title, summary: item.description || "미팅 후 내부 업무", workflowRunId, status: item.status, availableActions: ["view"] })),
    ...(actions.data ?? []).map((item): OliviaChatWorkItem => ({ id: item.id, kind: "action", title: item.title, summary: item.description || "올리비아 후속 행동", workflowRunId, status: item.status, availableActions: item.status === "waiting_approval" ? ["view", "approve", "dismiss"] : item.status === "approved" ? ["view", "run", "dismiss"] : ["view", "dismiss"] })),
  ];
  return workItems;
}

export function meetingContentHash(value: string) {
  return createHash("sha256").update(normalizeText(value)).digest("hex").slice(0, 20);
}
