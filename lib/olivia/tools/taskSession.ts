import { getSupabaseAdmin } from "@/lib/supabase";
import { fuzzyNameSearchOne } from "@/lib/olivia/nameSearch";
import { buildStepAppLink } from "@/lib/clientAppLinks";
import { computeTaskList, type TaskSessionType } from "@/lib/olivia/taskSession/nextAction";

const SESSION_TYPE_LABEL: Record<TaskSessionType, string> = {
  "shoot-prep": "촬영 준비",
  "quote-prep": "견적 준비",
  "contract-prep": "계약 준비",
  "delivery": "납품",
  "general": "업무",
};

async function resolveActiveRun(clientName: string) {
  const db = getSupabaseAdmin();
  return fuzzyNameSearchOne<{ id: string; client_id: string; client_name: string; current_step_key: string }>({
    db, table: "workflow_runs", nameColumn: "client_name",
    select: "id, client_id, client_name, current_step_key",
    query: clientName,
    filter: (q: any) => q.eq("status", "active").order("updated_at", { ascending: false }),
  });
}

async function findOrCreateSession(db: ReturnType<typeof getSupabaseAdmin>, run: { id: string; client_id: string }, sessionType: TaskSessionType, title: string) {
  const { data: existing } = await db
    .from("olivia_task_sessions")
    .select("*")
    .eq("project_id", run.id)
    .eq("session_type", sessionType)
    .neq("status", "completed")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existing) {
    if (existing.status === "paused") {
      await db.from("olivia_task_sessions").update({ status: "active", updated_at: new Date().toISOString() }).eq("id", existing.id);
    }
    return existing;
  }
  const { data: created, error } = await db
    .from("olivia_task_sessions")
    .insert({ client_id: run.client_id, project_id: run.id, session_type: sessionType, title, status: "active" })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return created;
}

function summarize(clientName: string, sessionType: TaskSessionType, tasks: Awaited<ReturnType<typeof computeTaskList>>["tasks"]) {
  const done = tasks.filter((t) => t.status === "done").length;
  const remaining = tasks.filter((t) => t.status !== "done");
  const label = SESSION_TYPE_LABEL[sessionType];
  if (remaining.length === 0) {
    return `${clientName} ${label}는 ${tasks.length}개 항목이 모두 끝났어요.`;
  }
  const nextTitle = remaining[0].title;
  return `${clientName} ${label}는 ${tasks.length}개 중 ${done}개 완료됐어요. 다음은 ${nextTitle}입니다.`;
}

// "히어 촬영 준비하자" — 세션을 시작(또는 일시정지 상태면 재개)하고 현재 할 일의 workspace를 연다.
export async function startTaskSession(input: any) {
  const clientName = String(input?.clientName || "").trim();
  const sessionType = (String(input?.sessionType || "shoot-prep").trim() as TaskSessionType) in SESSION_TYPE_LABEL
    ? (String(input?.sessionType || "shoot-prep").trim() as TaskSessionType)
    : "shoot-prep";
  const run = await resolveActiveRun(clientName);
  if (!run) return { action: "done", message: `"${clientName}"의 진행 중인 프로젝트를 찾을 수 없어요.` };

  const db = getSupabaseAdmin();
  const label = SESSION_TYPE_LABEL[sessionType];
  const session = await findOrCreateSession(db, run, sessionType, `${run.client_name} ${label}`);
  const { tasks, currentTaskKey } = await computeTaskList(db, run.id, sessionType);
  if (currentTaskKey) {
    await db.from("olivia_task_sessions").update({ current_task_key: currentTaskKey, updated_at: new Date().toISOString() }).eq("id", session.id);
  }

  const href = currentTaskKey ? buildStepAppLink({ stepKey: currentTaskKey, clientId: run.client_id, workflowRunId: run.id }) : undefined;
  return {
    action: "done",
    message: `${run.client_name} ${label}를 시작할게요. ${summarize(run.client_name, sessionType, tasks)}`,
    sessionId: session.id,
    href,
  };
}

// "지금 뭐 남았어?" / "어디까지 했지?"
export async function getTaskSessionStatus(input: any) {
  const clientName = String(input?.clientName || "").trim();
  if (!clientName) return { action: "done", message: "어느 고객의 업무를 확인할지 알려주세요." };
  const run = await resolveActiveRun(clientName);
  if (!run) return { action: "done", message: `"${clientName}"의 진행 중인 프로젝트를 찾을 수 없어요.` };

  const db = getSupabaseAdmin();
  const { data: session } = await db
    .from("olivia_task_sessions")
    .select("*")
    .eq("project_id", run.id)
    .neq("status", "completed")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!session) return { action: "done", message: `${run.client_name}은(는) 지금 진행 중인 Task Session이 없어요. "${run.client_name} 촬영 준비하자"처럼 시작해주세요.` };

  const sessionType = session.session_type as TaskSessionType;
  const { tasks } = await computeTaskList(db, run.id, sessionType);
  return { action: "done", message: summarize(run.client_name, sessionType, tasks), sessionId: session.id };
}

// "계속하자" / "다음" — 활성 세션이 있으면 다음 미완료 항목의 workspace를 연다.
export async function continueTaskSession(input: any) {
  const clientName = String(input?.clientName || "").trim();
  if (!clientName) return { action: "done", message: "어느 고객 업무를 이어갈지 알려주세요." };
  const run = await resolveActiveRun(clientName);
  if (!run) return { action: "done", message: `"${clientName}"의 진행 중인 프로젝트를 찾을 수 없어요.` };

  const db = getSupabaseAdmin();
  const { data: session } = await db
    .from("olivia_task_sessions")
    .select("*")
    .eq("project_id", run.id)
    .neq("status", "completed")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!session) return { action: "done", message: `${run.client_name}은(는) 지금 진행 중인 Task Session이 없어요. "${run.client_name} 촬영 준비하자"처럼 시작해주세요.` };

  const sessionType = session.session_type as TaskSessionType;
  if (session.status === "paused") {
    await db.from("olivia_task_sessions").update({ status: "active", updated_at: new Date().toISOString() }).eq("id", session.id);
  }
  const { tasks, currentTaskKey } = await computeTaskList(db, run.id, sessionType);
  if (currentTaskKey) {
    await db.from("olivia_task_sessions").update({ current_task_key: currentTaskKey, updated_at: new Date().toISOString() }).eq("id", session.id);
  }
  const href = currentTaskKey ? buildStepAppLink({ stepKey: currentTaskKey, clientId: run.client_id, workflowRunId: run.id }) : undefined;
  return { action: "done", message: summarize(run.client_name, sessionType, tasks), sessionId: session.id, href };
}

// "보류" — 지금은 이 업무를 그만 보고 싶을 때. 완료 처리가 아니라 일시정지.
export async function pauseTaskSession(input: any) {
  const clientName = String(input?.clientName || "").trim();
  if (!clientName) return { action: "done", message: "어느 고객 업무를 보류할지 알려주세요." };
  const run = await resolveActiveRun(clientName);
  if (!run) return { action: "done", message: `"${clientName}"의 진행 중인 프로젝트를 찾을 수 없어요.` };

  const db = getSupabaseAdmin();
  const { data: session } = await db
    .from("olivia_task_sessions")
    .select("id")
    .eq("project_id", run.id)
    .eq("status", "active")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!session) return { action: "done", message: `${run.client_name}은(는) 지금 진행 중인 Task Session이 없어요.` };

  await db.from("olivia_task_sessions").update({ status: "paused", updated_at: new Date().toISOString() }).eq("id", session.id);
  return { action: "done", message: `${run.client_name} 업무를 보류했어요. 나중에 "계속하자"라고 말하면 이어갈게요.` };
}
