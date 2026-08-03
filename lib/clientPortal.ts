import { getSupabaseAdmin } from "./supabase";
import { randomUUID } from "crypto";
import { STEP_NAME } from "./workflow";
import { getClientVisibleMenus, getClientWorkflowProgress } from "./pcrm/clientWorkflow";

export type PortalSession = {
  accessId: string;
  clientId: string;
  clientName: string;
  managerName: string;
  email: string;
  phone: string;
  workflowStatus: string;
  workflowRunId: string | null;
  projectScoped: boolean;
  projectName: string;
  projectStatus: string;
  shootDate: string | null;
  projectProgress: number;
  visibleMenus: ReturnType<typeof getClientVisibleMenus>;
  currentStepKey: string;
  currentStepName: string;
  tokenExpiresAt: string | null;
};

export const PORTAL_EVENT_LABEL: Record<string, string> = {
  portal_accessed: "포털 접속",
  gallery_viewed: "갤러리 확인",
  revision_requested: "수정 요청 제출",
  review_submitted: "리뷰 작성 완료",
  per_viewed: "PER 포인트 확인",
  product_requested: "제품 신청",
  donation_requested: "기부 신청",
  quote_viewed: "견적서 확인",
  contract_viewed: "계약서 확인",
  conti_viewed: "콘티 확인",
  quote_ready: "견적서 새로 등록됨",
  contract_ready: "계약서 새로 등록됨",
  gallery_ready: "갤러리 새로 등록됨",
  conti_ready: "콘티 새로 등록됨",
};

export async function validatePortalToken(token: string): Promise<PortalSession | null> {
  if (!token || token.length < 16) return null;
  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("client_portal_access")
    .select("id, client_id, workflow_run_id, email, token_expires_at, access_count, clients(id, hospital_name, contact_name, email, phone, specialty)")
    .eq("access_token", token)
    .eq("is_active", true)
    .single();

  if (error || !data) return null;
  if (data.token_expires_at && new Date(data.token_expires_at) < new Date()) return null;

  const runQuery = db
    .from("workflow_runs")
    .select("id, client_id, project_name, manager_name, current_step_key, status, shoot_date")
    .eq("client_id", data.client_id);
  const runResult = data.workflow_run_id
    ? await runQuery.eq("id", data.workflow_run_id).maybeSingle()
    : await runQuery.neq("status", "canceled").order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (runResult.error || !runResult.data) return null;

  await db.from("client_portal_access").update({
    last_login_at: new Date().toISOString(),
    access_count: Number(data.access_count ?? 0) + 1,
  }).eq("id", data.id);

  const c = data.clients as any;
  const runData = runResult.data;
  const currentStepKey = runData?.current_step_key ?? "consult_meeting";
  const currentStepName = STEP_NAME[currentStepKey] ?? currentStepKey;

  return {
    accessId: data.id,
    clientId: data.client_id,
    clientName: c?.hospital_name ?? "",
    managerName: runData?.manager_name ?? c?.contact_name ?? "",
    email: data.email ?? c?.email ?? "",
    phone: c?.phone ?? "",
    workflowStatus: runData?.status ?? "active",
    workflowRunId: runData?.id ?? null,
    projectScoped: Boolean(data.workflow_run_id),
    projectName: runData?.project_name ?? "포토클리닉 프로젝트",
    projectStatus: runData?.status ?? "active",
    shootDate: runData?.shoot_date ?? null,
    projectProgress: getClientWorkflowProgress(currentStepKey, runData?.status),
    visibleMenus: getClientVisibleMenus(currentStepKey),
    currentStepKey,
    currentStepName,
    tokenExpiresAt: data.token_expires_at,
  };
}

export async function logPortalEvent(params: {
  clientId: string;
  eventType: string;
  targetType?: string;
  targetId?: string;
  memo?: string;
  workflowRunId?: string | null;
}) {
  const db = getSupabaseAdmin();
  await Promise.all([
    db.from("client_portal_events").insert({
      client_id: params.clientId,
      workflow_run_id: params.workflowRunId ?? null,
      event_type: params.eventType,
      target_type: params.targetType ?? "",
      target_id: params.targetId ?? "",
      memo: params.memo ?? "",
    }),
    db.from("agent_logs").insert({
      client_id: params.clientId,
      workflow_run_id: params.workflowRunId ?? null,
      log_type: "portal_event",
      message: `[포털] ${PORTAL_EVENT_LABEL[params.eventType] ?? params.eventType}${params.memo ? `: ${params.memo}` : ""}`,
      success: true,
    }),
    db.from("pcrm_activity_logs").insert({
      client_id: params.clientId,
      workflow_run_id: params.workflowRunId ?? null,
      actor_type: "client",
      actor_name: "고객",
      action_type: params.eventType,
      title: PORTAL_EVENT_LABEL[params.eventType] ?? params.eventType,
      description: params.memo ?? "",
      related_type: params.targetType ?? "",
      related_id: params.targetId ?? "",
    }),
  ]);
}

export async function createPortalAccess(params: {
  clientId: string;
  workflowRunId?: string | null;
  email?: string;
  expiresInDays?: number;
}): Promise<{ token: string; expiresAt: string | null }> {
  const db = getSupabaseAdmin();
  const token = randomUUID().replace(/-/g, "") + randomUUID().replace(/-/g, "");
  const expiresAt = params.expiresInDays
    ? new Date(Date.now() + params.expiresInDays * 86400000).toISOString()
    : null;

  let revokeQuery = db.from("client_portal_access").update({ is_active: false }).eq("client_id", params.clientId);
  revokeQuery = params.workflowRunId
    ? revokeQuery.eq("workflow_run_id", params.workflowRunId)
    : revokeQuery.is("workflow_run_id", null);
  await revokeQuery;

  const { data, error } = await db
    .from("client_portal_access")
    .insert({
      client_id: params.clientId,
      workflow_run_id: params.workflowRunId ?? null,
      email: params.email ?? "",
      access_token: token,
      token_expires_at: expiresAt,
      is_active: true,
    })
    .select("access_token, token_expires_at")
    .single();

  if (error) throw error;
  return { token: data.access_token, expiresAt: data.token_expires_at };
}

// 포털 토큰은 프로젝트(워크플로우) 단위로 하나만 존재 — 견적 공개 때 만든 링크를 계약/콘티
// 등 이후 문서 공개 때도 그대로 재사용해야 고객이 받은 링크가 중간에 끊기지 않는다.
// createPortalAccess()를 다시 호출하면 기존 토큰을 즉시 무효화하므로, 이미 유효한 토큰이
// 있으면 그것을 재사용하고 없을 때만 새로 발급한다.
export async function ensurePortalAccess(params: {
  clientId: string;
  workflowRunId?: string | null;
  email?: string;
  expiresInDays?: number;
}): Promise<{ token: string; expiresAt: string | null }> {
  const db = getSupabaseAdmin();
  let query = db
    .from("client_portal_access")
    .select("access_token, token_expires_at")
    .eq("client_id", params.clientId)
    .eq("is_active", true);
  query = params.workflowRunId ? query.eq("workflow_run_id", params.workflowRunId) : query.is("workflow_run_id", null);
  const { data: existing } = await query.order("created_at", { ascending: false }).limit(1).maybeSingle();

  const isExpired = existing?.token_expires_at ? new Date(existing.token_expires_at).getTime() < Date.now() : false;
  if (existing && !isExpired) {
    return { token: existing.access_token, expiresAt: existing.token_expires_at };
  }
  return createPortalAccess(params);
}

export async function revokePortalAccess(clientId: string, workflowRunId?: string | null) {
  const db = getSupabaseAdmin();
  let query = db.from("client_portal_access").update({ is_active: false }).eq("client_id", clientId);
  query = workflowRunId ? query.eq("workflow_run_id", workflowRunId) : query.is("workflow_run_id", null);
  await query;
}
