import { getSupabaseAdmin } from "./supabase";
import { randomUUID } from "crypto";
import { STEP_NAME } from "./workflow";

export type PortalSession = {
  accessId: string;
  clientId: string;
  clientName: string;
  managerName: string;
  email: string;
  phone: string;
  workflowStatus: string;
  workflowRunId: string | null;
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
};

export async function validatePortalToken(token: string): Promise<PortalSession | null> {
  if (!token || token.length < 16) return null;
  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("client_portal_access")
    .select("id, client_id, email, token_expires_at, clients(id, name, manager_name, phone, workflow_status)")
    .eq("access_token", token)
    .eq("is_active", true)
    .single();

  if (error || !data) return null;
  if (data.token_expires_at && new Date(data.token_expires_at) < new Date()) return null;

  const [, runResult] = await Promise.all([
    db.from("client_portal_access").update({ last_login_at: new Date().toISOString() }).eq("id", data.id),
    db
      .from("workflow_runs")
      .select("id, current_step_key")
      .eq("client_id", data.client_id)
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const c = data.clients as any;
  const runData = runResult.data;
  const currentStepKey = runData?.current_step_key ?? "consult_received";
  const currentStepName = STEP_NAME[currentStepKey] ?? currentStepKey;

  return {
    accessId: data.id,
    clientId: data.client_id,
    clientName: c?.name ?? "",
    managerName: c?.manager_name ?? "",
    email: data.email ?? c?.email ?? "",
    phone: c?.phone ?? "",
    workflowStatus: c?.workflow_status ?? "상담완료",
    workflowRunId: runData?.id ?? null,
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
  ]);
}

export async function createPortalAccess(params: {
  clientId: string;
  email?: string;
  expiresInDays?: number;
}): Promise<{ token: string; expiresAt: string | null }> {
  const db = getSupabaseAdmin();
  const token = randomUUID().replace(/-/g, "") + randomUUID().replace(/-/g, "");
  const expiresAt = params.expiresInDays
    ? new Date(Date.now() + params.expiresInDays * 86400000).toISOString()
    : null;

  await db.from("client_portal_access").update({ is_active: false }).eq("client_id", params.clientId);

  const { data, error } = await db
    .from("client_portal_access")
    .insert({
      client_id: params.clientId,
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

export async function revokePortalAccess(clientId: string) {
  const db = getSupabaseAdmin();
  await db.from("client_portal_access").update({ is_active: false }).eq("client_id", clientId);
}
