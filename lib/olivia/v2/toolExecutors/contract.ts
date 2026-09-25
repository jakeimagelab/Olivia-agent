import { getSupabaseAdmin } from "@/lib/supabase";
import { computeContractDeposit } from "@/lib/contract/computeContractDeposit";
import { requireClientTarget } from "@/lib/core/context/clientTarget";
import type { OliviaContextSnapshot, OliviaToolResult } from "@/lib/olivia/v2/types";
import { text, activeResource, latestResource } from "./common";
import { loadQuote } from "./quote";
import { createVerification } from "./verification";
import { createContractFromQuote, publishContract } from "@/lib/core/commands/document";
import { OliviaToolError } from "@/lib/olivia/v2/toolError";
import { registerTemporaryDocument } from "@/lib/olivia/documents/temporaryDocuments";

async function loadContractRow(id: string) {
  const db = getSupabaseAdmin();
  const { data, error } = await db.from("contracts").select("*").eq("id", id).maybeSingle();
  if (error || !data) throw new Error("현재 계약서를 불러오지 못했어요.");
  return data as Record<string, unknown>;
}

async function saveContractRow(id: string, data: Record<string, unknown>) {
  const db = getSupabaseAdmin();
  const { data: updated, error } = await db.from("contracts").update(data).eq("id", id).select("*").single();
  if (error || !updated) throw new Error("계약서를 저장하지 못했어요.");
  return updated as Record<string, unknown>;
}

export const CONTRACT_TOOL_NAMES = [
  "create_contract", "get_contract", "preview_contract", "update_contract_terms", "request_contract_signature",
  "request_contract_publish", "publish_contract", "download_contract_pdf",
] as const;

export async function executeContractTool(
  name: string,
  input: Record<string, unknown>,
  context: OliviaContextSnapshot,
): Promise<OliviaToolResult> {
  const db = getSupabaseAdmin();

  if (name === "get_contract" || name === "preview_contract") {
    const resourceId = text(input, "contractId") || activeResource(context, "contract");
    const contract = await loadContractRow(resourceId);
    return {
      tool: name,
      success: true,
      data: { contractId: resourceId, resourceId, contract, summary: name === "preview_contract" ? "계약서 미리보기를 준비했어요." : "계약서를 불러왔어요." },
      verification: createVerification({ executed: true, resourceExists: true }),
    };
  }

  if (name === "create_contract") {
    // 견적 우선순위(스펙 §3, 2026-08-30) — "이 견적으로 계약서 만들어줘"처럼 지금 보고 있는
    // 견적을 가리킬 때 이름 기반 최신 조회가 엉뚱한 견적을 잡지 않도록, 명시된 quoteId나 지금
    // 열려 있는 견적 Workspace를 hospitalName 매칭보다 먼저 확인한다.
    const quoteId = text(input, "quoteId");
    let quote: Record<string, unknown> | null = null;
    if (quoteId) {
      quote = await loadQuote(quoteId).catch(() => null);
    } else if (context.activeWorkspace === "quote" && context.activeResourceId) {
      quote = await loadQuote(context.activeResourceId).catch(() => null);
    }
    const explicitHospitalName = text(input, "hospitalName");
    const hospitalName = explicitHospitalName || context.activeClientName || (quote ? String(quote.hospital_name || "") : "");
    if (!quote) {
      if (!hospitalName) {
        const clientTarget = requireClientTarget(context, explicitHospitalName, "계약서");
        if (!clientTarget.ok) throw new Error(clientTarget.message);
      }
      quote = await latestResource("quote", { ...context, activeClientName: hospitalName });
    }
    if (!quote) throw new Error("계약서의 기준이 될 견적서를 먼저 만들어주세요.");
    const finalHospitalName = hospitalName || String(quote.hospital_name || "");
    if (!finalHospitalName) {
      const clientTarget = requireClientTarget(context, explicitHospitalName, "계약서");
      if (!clientTarget.ok) throw new Error(clientTarget.message);
    }
    const resolvedQuoteId = String(quote.id || quoteId || (context.activeWorkspace === "quote" ? context.activeResourceId : "") || "");
    if (!resolvedQuoteId) throw new Error("계약서의 기준 견적 ID를 확인하지 못했어요.");
    const createResult = await createContractFromQuote(resolvedQuoteId, db);
    if (!createResult.ok) throw new OliviaToolError(createResult.reason, createResult.code ?? "CONTRACT_CREATE_FAILED", createResult.details);
    const execution = createResult.value;
    const record = await loadContractRow(execution.contractId);
    const registered = await registerTemporaryDocument(db, {
      documentType: "contract",
      sourceTable: "contracts",
      sourceId: execution.contractId,
      title: `${record.hospital_name || finalHospitalName} 계약서`,
      hospitalName: String(record.hospital_name || finalHospitalName),
      clientId: execution.clientId,
      workflowRunId: execution.workflowRunId,
      metadata: { quoteNumber: record.quote_number || null },
    });
    const temporaryDocument = registered.temporaryDocument;
    return {
      tool: name,
      success: true,
      data: {
        contractId: execution.contractId,
        resourceId: execution.contractId,
        hospitalName: record.hospital_name,
        clientId: temporaryDocument.client_id,
        workflowRunId: temporaryDocument.workflow_run_id,
        temporaryDocumentId: temporaryDocument.id,
        temporaryDocumentStatus: temporaryDocument.status,
        clientResolution: registered.clientResolution,
        summary: temporaryDocument.status === "linked"
          ? `${record.hospital_name || finalHospitalName} 계약서를 저장하고 기존 고객에게 연결했어요.`
          : `${record.hospital_name || finalHospitalName} 계약서를 임시문서함에 저장했어요. 내용을 확인해주세요.`,
      },
      verification: createVerification({
        executed: true,
        persisted: Boolean(execution.contractId),
        resourceExists: Boolean(execution.contractId),
        linked: temporaryDocument.status === "linked",
        details: { temporaryDocumentId: temporaryDocument.id, temporaryDocumentStatus: temporaryDocument.status },
      }),
    };
  }

  if (name === "update_contract_terms") {
    const resourceId = activeResource(context, "contract");
    const contract = await loadContractRow(resourceId);
    const patch: Record<string, unknown> = {};
    let depositRate: number | undefined;
    if (input.depositRate != null) {
      depositRate = Number(input.depositRate);
      if (!Number.isFinite(depositRate) || depositRate < 0 || depositRate > 100) throw new Error("계약금 비율을 확인해주세요.");
      patch.deposit_rate = depositRate;
    }
    if (input.paymentTerms != null) patch.payment_terms = String(input.paymentTerms).trim();
    if (input.deliveryTerms != null) patch.delivery_terms = String(input.deliveryTerms).trim();
    if (input.specialTerms != null) patch.special_terms = String(input.specialTerms).trim();
    if (!Object.keys(patch).length) throw new Error("변경할 내용을 알려주세요.");
    const updatedResource = await saveContractRow(resourceId, patch);
    for (const [key, value] of Object.entries(patch)) {
      if (updatedResource[key] !== value) throw new Error(`계약 조건 저장 검증이 일치하지 않아요: ${key}`);
    }
    const quoteData = (contract.quote_data && typeof contract.quote_data === "object") ? contract.quote_data as Record<string, unknown> : {};
    const totalAmount = Number(quoteData.totalAmount) || 0;
    const summary = depositRate != null
      ? (() => {
          const amounts = computeContractDeposit(totalAmount, depositRate as number);
          return `계약 조건을 수정했어요. 계약금 ${depositRate}%(${amounts.depositAmount.toLocaleString("ko-KR")}원), 잔금 ${amounts.balanceAmount.toLocaleString("ko-KR")}원이에요.`;
        })()
      : "계약 조건을 수정했어요.";
    return {
      tool: name, success: true,
      data: { resourceId, contractId: resourceId, updatedResource, summary },
      // saveContractRow가 실패하면 이미 throw했으므로, 여기 도달한 것 자체가 실제 저장 확인이다.
      // depositRate는 updatedResource.deposit_rate(실제 저장값)로 다시 한번 확인한다(스펙 §14).
      verification: createVerification({ executed: true, persisted: true, resourceExists: true, details: { depositRate: updatedResource.deposit_rate == null ? null : Number(updatedResource.deposit_rate) } }),
    };
  }

  if (name === "request_contract_signature") {
    const resourceId = activeResource(context, "contract");
    const contract = await loadContractRow(resourceId);
    return {
      tool: name, success: true,
      data: { resourceId, contractId: resourceId, hospitalName: contract.hospital_name, summary: "대표 서명이 필요해요." },
      verification: createVerification({ executed: true, persisted: false, resourceExists: true }),
    };
  }

  if (name === "request_contract_publish") {
    const resourceId = activeResource(context, "contract");
    const contract = await loadContractRow(resourceId);
    const quoteData = (contract.quote_data && typeof contract.quote_data === "object") ? contract.quote_data as Record<string, unknown> : {};
    return {
      tool: name, success: true,
      data: { resourceId, contractId: resourceId, approvalRequired: true, hospitalName: contract.hospital_name, summary: `${contract.hospital_name || "현재 고객"} 계약서(${Number(quoteData.totalAmount || 0).toLocaleString("ko-KR")}원)를 최종 생성할까요?` },
      verification: createVerification({ executed: true, persisted: false, resourceExists: true }),
    };
  }

  if (name === "publish_contract") {
    const resourceId = activeResource(context, "contract");
    const contract = await loadContractRow(resourceId);
    // 최종 생성 전 필수 확인(스펙 §28) — 부족한 항목만 짚어서 되묻는다. 실제 고객/프로젝트
    // 연결과 최종 재조회는 API Route도 공유하는 publishContract Core Command가 처리한다.
    const quoteData = (contract.quote_data && typeof contract.quote_data === "object") ? contract.quote_data as Record<string, unknown> : {};
    const missing: string[] = [];
    if (!contract.hospital_name) missing.push("고객명");
    if (!(Number(quoteData.totalAmount) > 0)) missing.push("계약 금액");
    if (!quoteData.shootDate) missing.push("촬영 예정일");
    if (!contract.signature_data_url) missing.push("대표 서명");
    if (missing.length) throw new Error(`아직 부족한 항목이 있어요: ${missing.join(", ")}`);
    const publishResult = await publishContract(resourceId, {
      clientId: context.activeClientId,
      workflowRunId: context.activeProjectId,
      finalize: true,
    }, db);
    if (!publishResult.ok) throw new OliviaToolError(publishResult.reason, publishResult.code ?? "PUBLISH_FAILED", publishResult.details);
    const payload = publishResult.value;
    const updatedResource = payload.resource;
    return {
      tool: name, success: true,
      data: { resourceId, contractId: resourceId, updatedResource, ...payload, summary: "계약서를 최종 생성했어요." },
      // updatedResource.status(실제 저장된 값)가 "final"인지로 확인한다 — payload.ok만 믿지 않는다.
      verification: createVerification({ executed: true, persisted: updatedResource.status === "final", resourceExists: true, linked: Boolean(payload.clientId && payload.workflowRunId) }),
    };
  }

  if (name === "download_contract_pdf") {
    // download_quote_pdf와 동일한 원칙 — PDF는 브라우저에 열려 있는 ContractBuilder의
    // html2canvas/jsPDF로만 만들 수 있어 서버는 DB를 건드리지 않는다. 실제 다운로드는 client가
    // DOWNLOAD_CONTRACT_PDF ui_action을 받아 처리한다.
    const resourceId = activeResource(context, "contract");
    return {
      tool: name, success: true,
      data: { resourceId, contractId: resourceId, summary: "PDF를 준비하고 있어요…" },
      verification: createVerification({ executed: true }),
    };
  }

  throw new Error("지원하지 않는 Olivia 작업이에요.");
}
