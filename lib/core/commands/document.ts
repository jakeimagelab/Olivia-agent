import type { SupabaseClient } from "@supabase/supabase-js";
import { ensurePortalAccess, logPortalEvent } from "@/lib/clientPortal";
import { normalizeContractQuoteData } from "@/lib/contract/contractDocument";
import { PUBLICATION_TYPE_LABEL } from "@/lib/clientWorkspace/publications";
import { APPROVED_QUOTE_STATUSES } from "@/lib/clientWorkspace/quoteSelection";
import { OliviaToolError } from "@/lib/olivia/v2/toolError";
import { recordPcrmActivitySafely } from "@/lib/pcrm/activity";
import { publishContractService, publishQuoteService } from "@/lib/publications/publishResource";
import { resolveQuoteWorkflowLink } from "@/lib/quote/quoteWorkflowLink";
import { getSupabaseAdmin } from "@/lib/supabase";
import { ACTIVE_WORKFLOW_STEP_KEYS, getWorkflowDisplayStepKey } from "@/lib/workflow";
import { completeOpenStepTasksForManualSave, maybeAdvanceWorkflow } from "@/lib/workflowAutomation";
import { getCoreProjectSnapshot } from "@/lib/core/readModels/projectSnapshot";
import { completeStep } from "./workflow";
import { coreCommandFailure, type CoreCommandResult } from "./result";

type QuoteLinkOverrides = { forceClientId?: string; forceCreateNew?: boolean };
type ContractPublishOverrides = { clientId?: string; workflowRunId?: string; finalize?: boolean };

function commandFailure(error: unknown, fallback: string): CoreCommandResult<never> {
  if (error instanceof OliviaToolError) {
    return { ok: false, reason: error.message, code: error.code, details: error.details };
  }
  return coreCommandFailure(error, fallback);
}

function existingContractResult(
  existing: { id: string; source_quote_id?: string | null },
  quoteId: string,
  clientId: string,
  workflowRunId: string,
): CoreCommandResult<{ contractId: string; clientId: string; workflowRunId: string }> {
  if (existing.source_quote_id === quoteId) {
    return {
      ok: true,
      idempotent: true,
      value: { contractId: existing.id, clientId, workflowRunId },
    };
  }
  return {
    ok: false,
    reason: "이 프로젝트에는 다른 견적에서 생성된 계약서가 이미 있습니다.",
    code: "CONTRACT_SOURCE_CONFLICT",
    details: { contractId: existing.id, sourceQuoteId: existing.source_quote_id ?? null },
  };
}

function workflowStepIndex(stepKey: string) {
  const displayKey = getWorkflowDisplayStepKey(stepKey) ?? stepKey;
  return ACTIVE_WORKFLOW_STEP_KEYS.indexOf(displayKey as (typeof ACTIVE_WORKFLOW_STEP_KEYS)[number]);
}

function isWorkflowAfter(currentStep: string, completedStep: "contract" | "conti") {
  const currentIndex = workflowStepIndex(currentStep);
  const completedIndex = ACTIVE_WORKFLOW_STEP_KEYS.indexOf(completedStep);
  return currentIndex > completedIndex;
}

function isWorkflowBefore(currentStep: string, targetStep: "contract" | "conti") {
  const currentIndex = workflowStepIndex(currentStep);
  const targetIndex = ACTIVE_WORKFLOW_STEP_KEYS.indexOf(targetStep);
  return currentIndex >= 0 && currentIndex < targetIndex;
}

function workflowBlockedReason(stepName: "계약" | "콘티") {
  return `아직 완료되지 않은 ${stepName} 단계 업무 또는 승인이 있습니다.`;
}

export async function completeQuote(
  quoteId: string,
  overrides: QuoteLinkOverrides = {},
  db: SupabaseClient = getSupabaseAdmin(),
): Promise<CoreCommandResult<{
  clientId: string;
  workflowRunId: string;
  advanced: boolean;
  advanceReason?: string;
  status: string;
}>> {
  try {
    const { data: quote, error: quoteError } = await db.from("quotes").select("*").eq("id", quoteId).maybeSingle();
    if (quoteError) throw new OliviaToolError("견적서를 조회하지 못했습니다.", "DB_ERROR", { databaseMessage: quoteError.message });
    if (!quote) return { ok: false, reason: "견적서를 찾을 수 없습니다.", code: "NOT_FOUND" };

    const link = await resolveQuoteWorkflowLink(db, quote, overrides);
    if (link.status === "needs_confirmation") {
      return {
        ok: false,
        reason: "연결할 고객을 확인해주세요.",
        code: "AMBIGUOUS",
        details: { candidate: link.candidate },
      };
    }
    const { clientId, workflowRunId } = link;
    await completeOpenStepTasksForManualSave(db, workflowRunId, "quote");
    const advance = await maybeAdvanceWorkflow(db, workflowRunId, "quote");

    let status = String(quote.status || "draft");
    const canFinalize = advance.advanced || advance.reason === "current_step_changed";
    if (canFinalize && status !== "published" && status !== "final") {
      const { data: finalized, error: finalizeError } = await db.from("quotes")
        .update({ status: "final", updated_at: new Date().toISOString() })
        .eq("id", quoteId)
        .select("id,status,client_id,workflow_run_id")
        .single();
      if (finalizeError || !finalized) {
        throw new OliviaToolError("견적서 확정 상태를 저장하지 못했습니다.", "DB_ERROR", { databaseMessage: finalizeError?.message });
      }
      if (finalized.status !== "final" || finalized.client_id !== clientId || finalized.workflow_run_id !== workflowRunId) {
        throw new OliviaToolError("견적서 확정 상태 검증이 일치하지 않습니다.", "VERIFICATION_FAILED");
      }
      status = finalized.status;
    }

    await recordPcrmActivitySafely(db, {
      clientId,
      workflowRunId,
      actorType: "admin",
      actorName: "관리자",
      actionType: "quote_completed",
      title: advance.advanced || advance.reason === "current_step_changed"
        ? "견적서 단계가 최종완료 처리됨"
        : "견적서 단계 완료가 보류됨",
      description: !advance.advanced ? advance.reason : undefined,
      relatedType: "quote",
      relatedId: quoteId,
    });

    return {
      ok: true,
      value: {
        clientId,
        workflowRunId,
        advanced: advance.advanced,
        ...(!advance.advanced ? { advanceReason: advance.reason } : {}),
        status,
      },
    };
  } catch (error) {
    return commandFailure(error, "견적서 최종완료 처리에 실패했습니다.");
  }
}

export async function publishQuote(
  quoteId: string,
  overrides: QuoteLinkOverrides = {},
  db: SupabaseClient = getSupabaseAdmin(),
): Promise<CoreCommandResult<Awaited<ReturnType<typeof publishQuoteService>>>> {
  try {
    return { ok: true, value: await publishQuoteService(quoteId, overrides, db) };
  } catch (error) {
    return commandFailure(error, "견적서 공개에 실패했습니다.");
  }
}

export async function createContractFromQuote(
  quoteId: string,
  db: SupabaseClient = getSupabaseAdmin(),
): Promise<CoreCommandResult<{ contractId: string; clientId: string; workflowRunId: string }>> {
  try {
    const { data: quote, error: quoteError } = await db.from("quotes").select("*").eq("id", quoteId).maybeSingle();
    if (quoteError) throw new OliviaToolError("견적서를 조회하지 못했습니다.", "DB_ERROR", { databaseMessage: quoteError.message });
    if (!quote) return { ok: false, reason: "견적서를 찾을 수 없습니다.", code: "NOT_FOUND" };
    if (!APPROVED_QUOTE_STATUSES.has(String(quote.status || "draft"))) {
      return { ok: false, reason: "확정되지 않은 견적입니다.", code: "UNAPPROVED_QUOTE" };
    }

    const clientId = String(quote.client_id || "");
    const workflowRunId = String(quote.workflow_run_id || "");
    if (!clientId || !workflowRunId) {
      return { ok: false, reason: "견적서에 연결된 고객 프로젝트가 없습니다.", code: "BLOCKED" };
    }

    const { data: existing, error: existingError } = await db.from("contracts")
      .select("id,source_quote_id")
      .eq("workflow_run_id", workflowRunId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (existingError) throw new OliviaToolError("기존 계약서를 확인하지 못했습니다.", "DB_ERROR", { databaseMessage: existingError.message });
    if (existing) {
      return existingContractResult(existing, quoteId, clientId, workflowRunId);
    }

    const quoteData = normalizeContractQuoteData(quote, quote);
    if (!quoteData) return { ok: false, reason: "견적 데이터를 계약서 형식으로 변환하지 못했습니다.", code: "INVALID_QUOTE" };

    const { data: inserted, error: insertError } = await db.from("contracts").insert({
      quote_number: quote.quote_number ?? null,
      hospital_name: quote.hospital_name ?? "",
      client_id: clientId,
      workflow_run_id: workflowRunId,
      source_quote_id: quoteId,
      contact_name: quote.contact_name ?? "",
      email: quote.email ?? "",
      quote_data: quoteData,
      status: "draft",
      deposit_rate: quoteData.depositRate ?? quote.deposit_rate ?? null,
      payment_terms: quoteData.paymentTerms ?? null,
      delivery_terms: quoteData.deliveryTerms ?? null,
      special_terms: quoteData.specialTerms ?? null,
    }).select("id,client_id,workflow_run_id,source_quote_id").single();

    if (insertError || !inserted) {
      if (insertError?.code === "23505") {
        const { data: raced } = await db.from("contracts").select("id,source_quote_id").eq("workflow_run_id", workflowRunId).limit(1).maybeSingle();
        if (raced?.id) return existingContractResult(raced, quoteId, clientId, workflowRunId);
      }
      throw new OliviaToolError("계약서를 저장하지 못했습니다.", "DB_ERROR", { databaseMessage: insertError?.message });
    }
    if (inserted.client_id !== clientId || inserted.workflow_run_id !== workflowRunId || inserted.source_quote_id !== quoteId) {
      throw new OliviaToolError("계약서 출처 저장 검증이 일치하지 않습니다.", "VERIFICATION_FAILED");
    }

    try {
      await logPortalEvent({
        clientId,
        workflowRunId,
        eventType: "contract_ready",
        targetType: "contracts",
        targetId: inserted.id,
      });
    } catch (eventError) {
      const { data: removed, error: cleanupError } = await db.from("contracts")
        .delete()
        .eq("id", inserted.id)
        .select("id")
        .maybeSingle();
      if (cleanupError || !removed) {
        throw new OliviaToolError("계약서는 생성됐지만 이벤트 기록과 생성 취소에 실패했습니다. 관리자 확인이 필요합니다.", "ROLLBACK_FAILED", {
          contractId: inserted.id,
          eventError: eventError instanceof Error ? eventError.message : String(eventError),
          databaseMessage: cleanupError?.message,
        });
      }
      throw new OliviaToolError("계약서 이벤트를 기록하지 못해 생성을 취소했습니다.", "EVENT_FAILED", {
        eventError: eventError instanceof Error ? eventError.message : String(eventError),
      });
    }
    return { ok: true, value: { contractId: inserted.id, clientId, workflowRunId } };
  } catch (error) {
    return commandFailure(error, "계약서를 생성하지 못했습니다.");
  }
}

export async function completeContract(
  contractId: string,
  input: { workflowRunId?: string } = {},
  db: SupabaseClient = getSupabaseAdmin(),
): Promise<CoreCommandResult<{
  contractId: string;
  clientId: string;
  workflowRunId: string;
  status: string;
  advanced: boolean;
  currentStep: string;
  currentStepName: string;
}>> {
  try {
    const { data: contract, error: contractError } = await db.from("contracts")
      .select("id,status,client_id,workflow_run_id,source_quote_id")
      .eq("id", contractId)
      .maybeSingle();
    if (contractError) throw new OliviaToolError("계약서를 조회하지 못했습니다.", "DB_ERROR", { databaseMessage: contractError.message });
    if (!contract) return { ok: false, reason: "계약서를 찾을 수 없습니다.", code: "NOT_FOUND" };

    const clientId = String(contract.client_id || "");
    const workflowRunId = String(contract.workflow_run_id || "");
    if (!clientId || !workflowRunId) {
      return { ok: false, reason: "계약서에 연결된 고객 프로젝트가 없습니다.", code: "BLOCKED" };
    }
    if (input.workflowRunId && input.workflowRunId !== workflowRunId) {
      return {
        ok: false,
        reason: "현재 프로젝트와 계약서의 연결 정보가 일치하지 않습니다.",
        code: "RESOURCE_PROJECT_MISMATCH",
      };
    }

    const before = await getCoreProjectSnapshot(workflowRunId, db);
    if (!before.ok) return before;
    if (before.value.resources.contract?.id !== contractId) {
      return {
        ok: false,
        reason: "현재 프로젝트의 계약서와 완료하려는 계약서가 일치하지 않습니다.",
        code: "RESOURCE_MISMATCH",
      };
    }
    if (contract.status === "final" && isWorkflowAfter(before.value.workflow.currentStep, "contract")) {
      return {
        ok: true,
        idempotent: true,
        value: {
          contractId,
          clientId,
          workflowRunId,
          status: "final",
          advanced: false,
          currentStep: before.value.workflow.currentStep,
          currentStepName: before.value.workflow.currentStepName,
        },
      };
    }
    if (isWorkflowBefore(before.value.workflow.currentStep, "contract")) {
      return { ok: false, reason: "아직 계약 단계를 완료할 차례가 아닙니다.", code: "WORKFLOW_BLOCKED" };
    }

    const completion = await completeStep(workflowRunId, "contract", db);
    if (!completion.ok) return completion;
    if (!completion.value.advanced && completion.value.reason === "open_items") {
      return { ok: false, reason: workflowBlockedReason("계약"), code: "WORKFLOW_BLOCKED" };
    }
    if (!completion.value.advanced && completion.value.reason !== "current_step_changed") {
      return { ok: false, reason: "계약 단계를 완료하지 못했습니다.", code: "WORKFLOW_BLOCKED" };
    }

    if (contract.status !== "final") {
      const { data: updated, error: updateError } = await db.from("contracts")
        .update({ status: "final", updated_at: new Date().toISOString() })
        .eq("id", contractId)
        .select("id")
        .single();
      if (updateError || !updated) throw new OliviaToolError("계약서 최종 상태를 저장하지 못했습니다.", "DB_ERROR", { databaseMessage: updateError?.message });
    }
    const { data: verified, error: verifyError } = await db.from("contracts")
      .select("id,status,client_id,workflow_run_id")
      .eq("id", contractId)
      .maybeSingle();
    if (verifyError || !verified
      || verified.status !== "final"
      || verified.client_id !== clientId
      || verified.workflow_run_id !== workflowRunId) {
      throw new OliviaToolError("계약서 최종 상태 검증이 일치하지 않습니다.", "VERIFICATION_FAILED", { databaseMessage: verifyError?.message });
    }

    const after = await getCoreProjectSnapshot(workflowRunId, db);
    const expectedStep = completion.value.advanced
      ? after.ok && after.value.workflow.currentStep === "conti"
      : after.ok && isWorkflowAfter(after.value.workflow.currentStep, "contract");
    if (!after.ok
      || after.value.resources.contract?.id !== contractId
      || after.value.resources.contract.status !== "final"
      || !expectedStep) {
      return {
        ok: false,
        reason: after.ok ? "계약 완료 후 프로젝트 상태를 확인하지 못했습니다." : after.reason,
        code: "VERIFICATION_FAILED",
        details: { contractId, workflowRunId },
      };
    }

    await recordPcrmActivitySafely(db, {
      clientId,
      workflowRunId,
      actorType: "admin",
      actorName: "관리자",
      actionType: "contract_completed",
      title: "계약서 단계가 최종완료 처리됨",
      relatedType: "contract",
      relatedId: contractId,
    });
    return {
      ok: true,
      value: {
        contractId,
        clientId,
        workflowRunId,
        status: "final",
        advanced: completion.value.advanced,
        currentStep: after.value.workflow.currentStep,
        currentStepName: after.value.workflow.currentStepName,
      },
    };
  } catch (error) {
    return commandFailure(error, "계약서 최종완료 처리에 실패했습니다.");
  }
}

export async function publishContract(
  contractId: string,
  overrides: ContractPublishOverrides = {},
  db: SupabaseClient = getSupabaseAdmin(),
): Promise<CoreCommandResult<Awaited<ReturnType<typeof publishContractService>>>> {
  try {
    const published = await publishContractService(contractId, overrides, db);
    if (published.advanced) {
      const snapshot = await getCoreProjectSnapshot(published.workflowRunId, db);
      if (!snapshot.ok || snapshot.value.workflow.currentStep !== "conti") {
        return {
          ok: false,
          reason: snapshot.ok ? "계약 완료 후 콘티 단계 전환을 확인하지 못했습니다." : snapshot.reason,
          code: "VERIFICATION_FAILED",
          details: { contractId, workflowRunId: published.workflowRunId, publicationId: published.publicationId },
        };
      }
    }
    return { ok: true, value: published };
  } catch (error) {
    return commandFailure(error, "계약서 공개에 실패했습니다.");
  }
}

export async function completeConti(
  contiId: string,
  input: { workflowRunId?: string } = {},
  db: SupabaseClient = getSupabaseAdmin(),
): Promise<CoreCommandResult<{
  contiId: string;
  clientId: string | null;
  workflowRunId: string;
  advanced: boolean;
  currentStep: string;
  currentStepName: string;
}>> {
  try {
    const { data: canonical, error: canonicalError } = await db.from("conti_runs")
      .select("id,hospital_id,workflow_run_id,hospital_name")
      .eq("id", contiId)
      .maybeSingle();
    if (canonicalError) throw new OliviaToolError("콘티를 조회하지 못했습니다.", "DB_ERROR", { databaseMessage: canonicalError.message });

    let resource: { id: string; clientId: string | null; workflowRunId: string | null; source: "conti_runs" | "conti_saves" } | null = canonical
      ? {
          id: canonical.id,
          clientId: canonical.hospital_id ?? null,
          workflowRunId: canonical.workflow_run_id ?? null,
          source: "conti_runs",
        }
      : null;
    if (!resource) {
      const { data: legacy, error: legacyError } = await db.from("conti_saves")
        .select("id,client_id,workflow_run_id,title")
        .eq("id", contiId)
        .maybeSingle();
      if (legacyError) throw new OliviaToolError("이전 콘티를 조회하지 못했습니다.", "DB_ERROR", { databaseMessage: legacyError.message });
      if (legacy) {
        resource = {
          id: legacy.id,
          clientId: legacy.client_id ?? null,
          workflowRunId: legacy.workflow_run_id ?? null,
          source: "conti_saves",
        };
      }
    }
    if (!resource) return { ok: false, reason: "콘티를 찾을 수 없습니다.", code: "NOT_FOUND" };
    if (!resource.workflowRunId) {
      return { ok: false, reason: "콘티에 연결된 프로젝트가 없습니다.", code: "BLOCKED" };
    }
    const workflowRunId = resource.workflowRunId;
    if (input.workflowRunId && input.workflowRunId !== workflowRunId) {
      return {
        ok: false,
        reason: "현재 프로젝트와 콘티의 연결 정보가 일치하지 않습니다.",
        code: "RESOURCE_PROJECT_MISMATCH",
      };
    }

    const before = await getCoreProjectSnapshot(workflowRunId, db);
    if (!before.ok) return before;
    if (before.value.resources.conti?.id !== contiId) {
      return {
        ok: false,
        reason: "현재 프로젝트의 콘티와 완료하려는 콘티가 일치하지 않습니다.",
        code: "RESOURCE_MISMATCH",
      };
    }
    if (isWorkflowAfter(before.value.workflow.currentStep, "conti")) {
      return {
        ok: true,
        idempotent: true,
        value: {
          contiId,
          clientId: resource.clientId,
          workflowRunId,
          advanced: false,
          currentStep: before.value.workflow.currentStep,
          currentStepName: before.value.workflow.currentStepName,
        },
      };
    }
    if (isWorkflowBefore(before.value.workflow.currentStep, "conti")) {
      return { ok: false, reason: "아직 콘티 단계를 완료할 차례가 아닙니다.", code: "WORKFLOW_BLOCKED" };
    }

    const completion = await completeStep(workflowRunId, "conti", db);
    if (!completion.ok) return completion;
    if (!completion.value.advanced && completion.value.reason === "open_items") {
      return { ok: false, reason: workflowBlockedReason("콘티"), code: "WORKFLOW_BLOCKED" };
    }
    if (!completion.value.advanced && completion.value.reason !== "current_step_changed") {
      return { ok: false, reason: "콘티 단계를 완료하지 못했습니다.", code: "WORKFLOW_BLOCKED" };
    }

    const after = await getCoreProjectSnapshot(workflowRunId, db);
    const expectedStep = completion.value.advanced
      ? after.ok && after.value.workflow.currentStep === "shooting"
      : after.ok && isWorkflowAfter(after.value.workflow.currentStep, "conti");
    if (!after.ok || after.value.resources.conti?.id !== contiId || !expectedStep) {
      return {
        ok: false,
        reason: after.ok ? "콘티 완료 후 프로젝트 상태를 확인하지 못했습니다." : after.reason,
        code: "VERIFICATION_FAILED",
        details: { contiId, workflowRunId, source: resource.source },
      };
    }

    if (resource.clientId) {
      await recordPcrmActivitySafely(db, {
        clientId: resource.clientId,
        workflowRunId,
        actorType: "admin",
        actorName: "관리자",
        actionType: "conti_completed",
        title: "콘티 단계가 최종완료 처리됨",
        relatedType: "conti",
        relatedId: contiId,
      });
    }
    return {
      ok: true,
      value: {
        contiId,
        clientId: resource.clientId,
        workflowRunId,
        advanced: completion.value.advanced,
        currentStep: after.value.workflow.currentStep,
        currentStepName: after.value.workflow.currentStepName,
      },
    };
  } catch (error) {
    return commandFailure(error, "콘티 최종완료 처리에 실패했습니다.");
  }
}

export async function publishConti(
  contiId: string,
  input: { clientId: string; workflowRunId: string; title?: string },
  db: SupabaseClient = getSupabaseAdmin(),
): Promise<CoreCommandResult<{
  publicationId: string;
  portalToken: string | null;
  advanced: boolean;
  advanceReason?: string;
}>> {
  try {
    if (!input.clientId || !input.workflowRunId) {
      return { ok: false, reason: "clientId, workflowRunId가 필요합니다.", code: "INVALID_INPUT" };
    }
    const { data: canonicalConti, error: canonicalError } = await db.from("conti_runs")
      .select("id,hospital_id,workflow_run_id,hospital_name")
      .eq("id", contiId)
      .eq("hospital_id", input.clientId)
      .eq("workflow_run_id", input.workflowRunId)
      .maybeSingle();
    if (canonicalError) throw new OliviaToolError("콘티를 확인하지 못했습니다.", "DB_ERROR", { databaseMessage: canonicalError.message });
    let conti: { id: string; title?: string | null } | null = canonicalConti
      ? { id: canonicalConti.id, title: canonicalConti.hospital_name ? `${canonicalConti.hospital_name} 촬영 콘티` : null }
      : null;
    if (!conti) {
      const { data: legacyConti, error: legacyError } = await db.from("conti_saves")
        .select("id,client_id,workflow_run_id,title")
        .eq("id", contiId)
        .eq("client_id", input.clientId)
        .eq("workflow_run_id", input.workflowRunId)
        .maybeSingle();
      if (legacyError) throw new OliviaToolError("이전 콘티를 확인하지 못했습니다.", "DB_ERROR", { databaseMessage: legacyError.message });
      conti = legacyConti;
    }
    if (!conti) return { ok: false, reason: "이 프로젝트에 연결된 콘티를 찾을 수 없습니다.", code: "NOT_FOUND" };

    const { data: existing, error: lookupError } = await db.from("pcrm_publications")
      .select("id,version,status")
      .eq("workflow_run_id", input.workflowRunId)
      .eq("related_type", "conti")
      .eq("related_id", contiId)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (lookupError) throw new OliviaToolError("콘티 공개 이력을 확인하지 못했습니다.", "DB_ERROR", { databaseMessage: lookupError.message });

    const now = new Date().toISOString();
    const title = input.title || conti.title || PUBLICATION_TYPE_LABEL.conti;
    let publicationId: string;
    if (existing && ["draft", "internal_review", "revoked"].includes(existing.status)) {
      const { data: updated, error } = await db.from("pcrm_publications").update({
        status: "published",
        published_at: now,
        published_by: "admin",
        revoked_at: null,
        updated_at: now,
      }).eq("id", existing.id).select("id").single();
      if (error || !updated) throw new OliviaToolError("콘티 공개 상태를 저장하지 못했습니다.", "DB_ERROR", { databaseMessage: error?.message });
      publicationId = updated.id;
    } else {
      const { data: inserted, error } = await db.from("pcrm_publications").insert({
        client_id: input.clientId,
        workflow_run_id: input.workflowRunId,
        related_type: "conti",
        related_id: contiId,
        title,
        ...(existing ? { version: Number(existing.version) + 1 } : {}),
        status: "published",
        published_at: now,
        published_by: "admin",
        created_by: "admin",
      }).select("id").single();
      if (error || !inserted) throw new OliviaToolError("콘티 공개 이력을 저장하지 못했습니다.", "DB_ERROR", { databaseMessage: error?.message });
      publicationId = inserted.id;
    }

    const portal = await ensurePortalAccess({ clientId: input.clientId });
    await completeOpenStepTasksForManualSave(db, input.workflowRunId, "conti");
    const advance = await maybeAdvanceWorkflow(db, input.workflowRunId, "conti");
    await recordPcrmActivitySafely(db, {
      clientId: input.clientId,
      workflowRunId: input.workflowRunId,
      actorType: "admin",
      actorName: "관리자",
      actionType: "conti_published",
      title: `${title}이(가) 고객 포털에 공개됨`,
      relatedType: "conti",
      relatedId: contiId,
    });

    if (advance.advanced) {
      const snapshot = await getCoreProjectSnapshot(input.workflowRunId, db);
      if (!snapshot.ok
        || snapshot.value.workflow.currentStep !== "shooting"
        || snapshot.value.resources.conti?.id !== contiId) {
        return {
          ok: false,
          reason: snapshot.ok ? "콘티 완료 후 촬영 단계와 연결 자료를 확인하지 못했습니다." : snapshot.reason,
          code: "VERIFICATION_FAILED",
          details: { contiId, workflowRunId: input.workflowRunId, publicationId },
        };
      }
    }

    return {
      ok: true,
      value: {
        publicationId,
        portalToken: portal?.token ?? null,
        advanced: advance.advanced,
        ...(!advance.advanced ? { advanceReason: advance.reason } : {}),
      },
    };
  } catch (error) {
    return commandFailure(error, "콘티 공개에 실패했습니다.");
  }
}
