import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabase";
import { ensurePortalAccess } from "@/lib/clientPortal";
import { completeOpenStepTasksForManualSave, maybeAdvanceWorkflow } from "@/lib/workflowAutomation";
import { resolveQuoteWorkflowLink } from "@/lib/quote/quoteWorkflowLink";
import { recordPcrmActivitySafely } from "@/lib/pcrm/activity";
import { OliviaToolError } from "@/lib/olivia/v2/toolError";

type PublishKind = "quote" | "contract";

export type PublishResourceResult = {
  ok: true;
  clientId: string;
  workflowRunId: string;
  portalUrl: string;
  publicationId: string;
  resource: Record<string, unknown>;
};

async function persistPublication(db: SupabaseClient, kind: PublishKind, resource: Record<string, any>, clientId: string, workflowRunId: string) {
  const { data: existing, error: lookupError } = await db
    .from("pcrm_publications")
    .select("id, version, status")
    .eq("workflow_run_id", workflowRunId)
    .eq("related_type", kind)
    .eq("related_id", resource.id)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (lookupError) throw new OliviaToolError("공개 이력을 확인하지 못했습니다.", "DB_ERROR", { databaseMessage: lookupError.message });

  const now = new Date().toISOString();
  const common = { status: "published", published_at: now, published_by: "admin", updated_at: now };
  const mutation = existing?.status === "draft"
    ? db.from("pcrm_publications").update(common).eq("id", existing.id).select("*").single()
    : db.from("pcrm_publications").insert({
        client_id: clientId,
        workflow_run_id: workflowRunId,
        related_type: kind,
        related_id: resource.id,
        title: kind === "quote" ? resource.title || resource.quote_number || "견적서" : "계약서",
        ...(existing ? { version: Number(existing.version) + 1 } : {}),
        ...common,
        created_by: "admin",
      }).select("*").single();
  const { data: publication, error: publicationError } = await mutation;
  if (publicationError || !publication) {
    throw new OliviaToolError("공개 이력을 저장하지 못했습니다.", "DB_ERROR", { databaseMessage: publicationError?.message });
  }
  if (publication.status !== "published" || publication.related_id !== resource.id) {
    throw new OliviaToolError("공개 이력 저장 검증이 일치하지 않습니다.", "VERIFICATION_FAILED");
  }
  return publication as Record<string, unknown>;
}

function portalUrl(token: string) {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "https://olivia.photoclinic.kr";
  return `${baseUrl}/client-portal/access/${token}`;
}

export async function publishQuoteService(
  quoteId: string,
  overrides: { forceClientId?: string; forceCreateNew?: boolean } = {},
  db: SupabaseClient = getSupabaseAdmin(),
): Promise<PublishResourceResult> {
  const { data: quote, error: quoteError } = await db.from("quotes").select("*").eq("id", quoteId).maybeSingle();
  if (quoteError) throw new OliviaToolError("견적서를 조회하지 못했습니다.", "DB_ERROR", { databaseMessage: quoteError.message });
  if (!quote) throw new OliviaToolError("견적서를 찾을 수 없습니다.", "NOT_FOUND");

  const link = await resolveQuoteWorkflowLink(db, quote, overrides);
  if (link.status === "needs_confirmation") {
    throw new OliviaToolError("연결할 고객을 확인해주세요.", "AMBIGUOUS", { candidate: link.candidate });
  }
  const { clientId, workflowRunId } = link;
  const { data: publishedQuote, error: updateError } = await db
    .from("quotes").update({ status: "published" }).eq("id", quoteId).select("*").single();
  if (updateError || !publishedQuote) throw new OliviaToolError("견적서 공개 상태를 저장하지 못했습니다.", "DB_ERROR", { databaseMessage: updateError?.message });
  if (publishedQuote.status !== "published" || publishedQuote.client_id !== clientId || publishedQuote.workflow_run_id !== workflowRunId) {
    throw new OliviaToolError("견적서 공개 상태 검증이 일치하지 않습니다.", "VERIFICATION_FAILED");
  }

  const publication = await persistPublication(db, "quote", publishedQuote, clientId, workflowRunId);
  const portal = await ensurePortalAccess({ clientId, email: publishedQuote.email || undefined });
  if (!portal?.token) throw new OliviaToolError("고객 포털 접근 정보를 확인하지 못했습니다.", "VERIFICATION_FAILED");

  await recordPcrmActivitySafely(db, { clientId, workflowRunId, actorType: "admin", actorName: "관리자", actionType: "quote_published", title: "견적서가 고객 포털에 공개됨", relatedType: "quote", relatedId: quoteId });
  await completeOpenStepTasksForManualSave(db, workflowRunId, "quote");
  await maybeAdvanceWorkflow(db, workflowRunId, "quote");

  const { data: verified, error: verifyError } = await db.from("quotes").select("*").eq("id", quoteId).single();
  if (verifyError || !verified || verified.status !== "published" || verified.client_id !== clientId || verified.workflow_run_id !== workflowRunId) {
    throw new OliviaToolError("견적서 최종 상태를 확인하지 못했습니다.", "VERIFICATION_FAILED", { databaseMessage: verifyError?.message });
  }
  return { ok: true, clientId, workflowRunId, portalUrl: portalUrl(portal.token), publicationId: String(publication.id), resource: verified as Record<string, unknown> };
}

export async function publishContractService(
  contractId: string,
  overrides: { clientId?: string; workflowRunId?: string; finalize?: boolean } = {},
  db: SupabaseClient = getSupabaseAdmin(),
): Promise<PublishResourceResult> {
  const { data: contract, error: contractError } = await db.from("contracts").select("*").eq("id", contractId).maybeSingle();
  if (contractError) throw new OliviaToolError("계약서를 조회하지 못했습니다.", "DB_ERROR", { databaseMessage: contractError.message });
  if (!contract) throw new OliviaToolError("계약서를 찾을 수 없습니다.", "NOT_FOUND");
  const clientId = String(contract.client_id || overrides.clientId || "");
  const workflowRunId = String(contract.workflow_run_id || overrides.workflowRunId || "");
  if (!clientId || !workflowRunId) throw new OliviaToolError("계약서에 연결된 프로젝트가 없습니다. 먼저 견적서를 공개해 프로젝트를 생성해주세요.", "BLOCKED");

  const patch: Record<string, unknown> = { client_id: clientId, workflow_run_id: workflowRunId };
  if (overrides.finalize) patch.status = "final";
  const { data: linked, error: linkError } = await db.from("contracts").update(patch).eq("id", contractId).select("*").single();
  if (linkError || !linked) throw new OliviaToolError("계약서 연결 정보를 저장하지 못했습니다.", "DB_ERROR", { databaseMessage: linkError?.message });
  if (linked.client_id !== clientId || linked.workflow_run_id !== workflowRunId || (overrides.finalize && linked.status !== "final")) {
    throw new OliviaToolError("계약서 상태 저장 검증이 일치하지 않습니다.", "VERIFICATION_FAILED");
  }

  const publication = await persistPublication(db, "contract", linked, clientId, workflowRunId);
  const portal = await ensurePortalAccess({ clientId, email: linked.email || undefined });
  if (!portal?.token) throw new OliviaToolError("고객 포털 접근 정보를 확인하지 못했습니다.", "VERIFICATION_FAILED");
  await recordPcrmActivitySafely(db, { clientId, workflowRunId, actorType: "admin", actorName: "관리자", actionType: "contract_published", title: "계약서가 고객 포털에 공개됨", relatedType: "contract", relatedId: contractId });
  await completeOpenStepTasksForManualSave(db, workflowRunId, "contract");
  await maybeAdvanceWorkflow(db, workflowRunId, "contract");

  const { data: verified, error: verifyError } = await db.from("contracts").select("*").eq("id", contractId).single();
  if (verifyError || !verified || verified.client_id !== clientId || verified.workflow_run_id !== workflowRunId || (overrides.finalize && verified.status !== "final")) {
    throw new OliviaToolError("계약서 최종 상태를 확인하지 못했습니다.", "VERIFICATION_FAILED", { databaseMessage: verifyError?.message });
  }
  return { ok: true, clientId, workflowRunId, portalUrl: portalUrl(portal.token), publicationId: String(publication.id), resource: verified as Record<string, unknown> };
}
