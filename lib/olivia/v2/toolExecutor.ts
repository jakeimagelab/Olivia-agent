import type { FunctionTool } from "openai/resources/responses/responses";
import { getSupabaseAdmin } from "@/lib/supabase";
import { executeOliviaCrud } from "@/lib/olivia/crud/executor";
import { resolveUiActions } from "@/lib/olivia/agent/uiActionResolvers";
import { buildAgentQuoteData } from "@/lib/quote/agentQuote";
import { parseKoreanCount, parseKoreanMoney, parseShotPosition } from "@/lib/olivia/naturalLanguageNumbers";
import { addQuoteItem, recalculateQuote, removeQuoteItem, resolveQuoteItem, updateQuoteItem, type QuoteItem } from "@/lib/quote/quoteMutationService";
import { addContiShots, duplicateContiShot, estimateContiDuration, normalizeContiResult, removeContiShot, reorderContiShot, resolveContiShot, updateContiShot } from "@/lib/conti/contiMutationService";
import type {
  OliviaAgentToolExecution,
  OliviaContextSnapshot,
  OliviaToolCall,
  OliviaToolResult,
} from "@/lib/olivia/v2/types";
import {
  addCalendarTask,
  deleteCalendarTask,
  listCalendarTasks,
  resolveCalendarTaskId,
  updateCalendarTask,
} from "@/lib/olivia/tools/calendar";
import { advanceWorkflowStep, completeWorkflowRetroactively, getWorkflowStatus } from "@/lib/olivia/tools/workflow";
import { listMailingQueue, sendMailing } from "@/lib/olivia/tools/mailing";
import { createGallery, getGallery } from "@/lib/olivia/tools/gallery";
import { findCalendarConflicts } from "@/lib/assistant/actions/calendarAvailability";
import {
  createAssistantEmailDraft,
  readAssistantEmail,
  searchAssistantEmail,
  summarizeAssistantEmail,
} from "@/lib/assistant/actions/email";
import { ensurePrimaryAssistantOwner } from "@/lib/assistant/owners/service";
import { executeOliviaChatWorkTool, OLIVIA_CHAT_WORK_TOOL_NAMES } from "@/lib/olivia/chatWorkTools";

// calendar.ts/workflow.ts/mailing.ts/gallery.ts, chatWorkTools.ts는 전부 레거시(Claude) 경로와
// 공유하는 {action:"done", message, ...} 모양으로 결과를 돌려준다 — v2가 기대하는
// {tool, success, data} 모양으로 한 곳에서만 변환한다.
function fromLegacyResult(name: string, result: { action?: string; message: string; [key: string]: unknown }): OliviaToolResult {
  const { message, action, ...rest } = result;
  return { tool: name, success: true, data: { message, ...rest } };
}

export const OLIVIA_V2_TOOLS: FunctionTool[] = [
  {
    type: "function",
    name: "select_project",
    description: "고객명으로 실제 고객과 진행 프로젝트를 조회해 현재 Olivia Context로 선택합니다.",
    strict: true,
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: { hospitalName: { type: "string" } },
      required: ["hospitalName"],
    },
  },
  {
    type: "function",
    name: "create_quote",
    description: "고객의 실제 견적 초안을 DB에 생성합니다. 생성 성공 결과의 quoteId로만 화면을 엽니다.",
    strict: true,
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        hospitalName: { type: ["string", "null"] },
        packageId: { type: ["string", "null"], enum: ["standard", "premium", "premium-plus-1", "premium-plus-2", null] },
        contactName: { type: ["string", "null"] },
        phone: { type: ["string", "null"] },
        email: { type: ["string", "null"] },
        shootDate: { type: ["string", "null"] },
        profileCount: { type: ["number", "null"] },
        stagedCount: { type: ["number", "null"] },
        memo: { type: ["string", "null"] },
      },
      required: ["hospitalName", "packageId", "contactName", "phone", "email", "shootDate", "profileCount", "stagedCount", "memo"],
    },
  },
  {
    type: "function",
    name: "create_contract",
    description: "현재 고객/프로젝트의 최신 견적을 확인한 뒤 실제 계약서 초안을 DB에 생성합니다.",
    strict: true,
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: { hospitalName: { type: ["string", "null"] } },
      required: ["hospitalName"],
    },
  },
  {
    type: "function",
    name: "create_conti",
    description: "현재 고객의 실제 촬영 콘티 초안을 DB에 생성합니다.",
    strict: true,
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        hospitalName: { type: ["string", "null"] },
        title: { type: ["string", "null"] },
        specialties: { type: "array", items: { type: "string" } },
      },
      required: ["hospitalName", "title", "specialties"],
    },
  },
  {
    type: "function",
    name: "update_quote_item",
    description: "현재 열린 견적서의 선택 항목 또는 이름이 정확히 하나인 항목의 금액·수량·설명·메모를 실제 DB에서 수정합니다.",
    strict: true,
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        selector: { type: ["string", "null"], description: "항목 이름. 생략되면 현재 선택 항목 사용" },
        amount: { type: ["number", "string", "null"], description: "50, 50만원, 오십만원 등" },
        quantity: { type: ["number", "string", "null"] },
        description: { type: ["string", "null"] },
        note: { type: ["string", "null"] },
      },
      required: ["selector", "amount", "quantity", "description", "note"],
    },
  },
  { type: "function", name: "add_quote_item", description: "현재 견적서에 항목을 추가합니다. 기존 단가 근거가 없으면 unitPrice를 null로 두어 확인을 요청합니다.", strict: true, parameters: { type: "object", additionalProperties: false, properties: { name: { type: "string" }, unitPrice: { type: ["number", "string", "null"] }, quantity: { type: ["number", "string", "null"] }, description: { type: ["string", "null"] }, note: { type: ["string", "null"] } }, required: ["name", "unitPrice", "quantity", "description", "note"] } },
  { type: "function", name: "remove_quote_item", description: "현재 견적서에서 선택되거나 이름이 정확히 하나로 식별되는 일반 항목을 삭제합니다.", strict: true, parameters: { type: "object", additionalProperties: false, properties: { selector: { type: ["string", "null"] } }, required: ["selector"] } },
  { type: "function", name: "update_quote_note", description: "현재 견적서의 전체 메모를 수정합니다.", strict: true, parameters: { type: "object", additionalProperties: false, properties: { note: { type: "string" } }, required: ["note"] } },
  { type: "function", name: "apply_quote_discount", description: "현재 견적서에 원 단위 또는 퍼센트 할인을 적용하거나 제거합니다.", strict: true, parameters: { type: "object", additionalProperties: false, properties: { amount: { type: ["number", "string", "null"] }, percent: { type: ["number", "null"] }, remove: { type: "boolean" } }, required: ["amount", "percent", "remove"] } },
  { type: "function", name: "update_quote_vat_mode", description: "현재 견적서의 VAT 표시/계산 모드를 기존 견적 데이터에 반영합니다.", strict: true, parameters: { type: "object", additionalProperties: false, properties: { mode: { type: "string", enum: ["separate", "included", "excluded"] } }, required: ["mode"] } },
  { type: "function", name: "rebalance_quote_total", description: "목표 총액에 맞춘 조정안을 계산합니다. 즉시 수정하지 않고 반드시 승인 요청만 생성합니다.", strict: true, parameters: { type: "object", additionalProperties: false, properties: { targetTotal: { type: ["number", "string"] } }, required: ["targetTotal"] } },
  { type: "function", name: "preview_quote", description: "현재 견적서 미리보기를 엽니다. DB 변경은 없습니다.", strict: true, parameters: { type: "object", additionalProperties: false, properties: {}, required: [] } },
  { type: "function", name: "request_quote_publish", description: "현재 견적서 공개 승인을 요청합니다. 확인 전에는 공개하지 않습니다.", strict: true, parameters: { type: "object", additionalProperties: false, properties: {}, required: [] } },
  { type: "function", name: "add_conti_shots", description: "현재 콘티에 같은 성격의 컷을 1개 이상 추가합니다.", strict: true, parameters: { type: "object", additionalProperties: false, properties: { count: { type: ["number", "string"] }, shotType: { type: "string" }, description: { type: ["string", "null"] } }, required: ["count", "shotType", "description"] } },
  { type: "function", name: "update_conti_shot", description: "현재 선택되거나 번호/이름으로 하나만 식별되는 콘티 컷의 기존 필드를 수정합니다.", strict: true, parameters: { type: "object", additionalProperties: false, properties: { selector: { type: ["string", "null"] }, position: { type: ["number", "string", "null"] }, category: { type: ["string", "null"] }, duration: { type: ["string", "null"] }, location: { type: ["string", "null"] }, cameraAngle: { type: ["string", "null"] }, keyword: { type: ["string", "null"] }, description: { type: ["string", "null"] }, personnel: { type: ["string", "null"] }, notes: { type: ["string", "null"] } }, required: ["selector", "position", "category", "duration", "location", "cameraAngle", "keyword", "description", "personnel", "notes"] } },
  { type: "function", name: "remove_conti_shot", description: "콘티 컷 삭제 승인을 요청합니다. 확인 전에는 삭제하지 않습니다.", strict: true, parameters: { type: "object", additionalProperties: false, properties: { selector: { type: ["string", "null"] }, position: { type: ["number", "string", "null"] } }, required: ["selector", "position"] } },
  { type: "function", name: "reorder_conti_shot", description: "콘티 컷을 맨 앞이나 지정된 번호로 이동해 실제 저장합니다.", strict: true, parameters: { type: "object", additionalProperties: false, properties: { selector: { type: ["string", "null"] }, position: { type: ["number", "string", "null"] }, targetPosition: { type: ["number", "string"] } }, required: ["selector", "position", "targetPosition"] } },
  { type: "function", name: "duplicate_conti_shot", description: "현재 콘티 컷을 복제합니다.", strict: true, parameters: { type: "object", additionalProperties: false, properties: { selector: { type: ["string", "null"] }, position: { type: ["number", "string", "null"] } }, required: ["selector", "position"] } },
  { type: "function", name: "estimate_conti_duration", description: "현재 콘티의 촬영 시간을 추정합니다. DB를 변경하지 않습니다.", strict: true, parameters: { type: "object", additionalProperties: false, properties: {}, required: [] } },
  { type: "function", name: "generate_shoot_prep_from_conti", description: "현재 콘티와 기존 체크리스트에서 촬영 준비물을 정리합니다. 별도 시스템을 만들지 않습니다.", strict: true, parameters: { type: "object", additionalProperties: false, properties: {}, required: [] } },
  {
    type: "function",
    name: "show_workspace",
    description: "현재 고객과 프로젝트를 유지하면서 실제 최신 견적서·계약서·콘티 Workspace를 엽니다.",
    strict: true,
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: { workspace: { type: "string", enum: ["quote", "contract", "conti"] } },
      required: ["workspace"],
    },
  },
];

function text(input: Record<string, unknown>, key: string) {
  const value = input[key];
  return typeof value === "string" ? value.trim() : "";
}

function workspaceLabel(workspace: string) {
  return workspace === "quote" ? "견적서" : workspace === "contract" ? "계약서" : "콘티";
}

async function selectProject(hospitalName: string): Promise<OliviaToolResult> {
  const db = getSupabaseAdmin();
  const { data: exact, error: exactError } = await db.from("clients")
    .select("id,hospital_name")
    .eq("hospital_name", hospitalName)
    .limit(2);
  if (exactError) throw new Error("고객 정보를 확인하지 못했어요.");
  let clients = exact || [];
  if (!clients.length) {
    const { data: partial, error: partialError } = await db.from("clients")
      .select("id,hospital_name")
      .ilike("hospital_name", `%${hospitalName}%`)
      .limit(3);
    if (partialError) throw new Error("고객 정보를 확인하지 못했어요.");
    clients = partial || [];
  }
  if (!clients.length) throw new Error(`“${hospitalName}” 고객을 찾지 못했어요.`);
  if (clients.length > 1) throw new Error(`“${hospitalName}”과 비슷한 고객이 여러 명이에요. 이름을 조금 더 정확히 알려주세요.`);
  const client = clients[0];
  const { data: projects, error: projectError } = await db.from("workflow_runs")
    .select("id,project_name,status,updated_at")
    .eq("client_id", client.id)
    .order("updated_at", { ascending: false })
    .limit(2);
  if (projectError) throw new Error("프로젝트 정보를 확인하지 못했어요.");
  const active = (projects || []).find((project) => project.status === "active") || projects?.[0];
  if (!active) throw new Error(`${client.hospital_name}의 프로젝트를 찾지 못했어요.`);
  return {
    tool: "select_project",
    success: true,
    data: {
      clientId: String(client.id),
      clientName: String(client.hospital_name),
      projectId: String(active.id),
      projectName: String(active.project_name || `${client.hospital_name} 프로젝트`),
    },
  };
}

async function latestResource(workspace: "quote" | "contract" | "conti", context: OliviaContextSnapshot) {
  const db = getSupabaseAdmin();
  const config = workspace === "quote"
    ? { table: "quotes", date: "created_at" }
    : workspace === "conti"
      ? { table: "conti_saves", date: "saved_at" }
      : { table: "contracts", date: "created_at" };
  let query = db.from(config.table).select("*").order(config.date, { ascending: false }).limit(1);
  if (context.activeProjectId) query = query.eq("workflow_run_id", context.activeProjectId);
  else if (context.activeClientId) query = query.eq("client_id", context.activeClientId);
  else if (context.activeClientName) query = query.eq("hospital_name", context.activeClientName);
  const { data, error } = await query.maybeSingle();
  if (error) throw new Error(`${workspaceLabel(workspace)} 데이터를 확인하지 못했어요.`);
  return data as Record<string, unknown> | null;
}

function activeResource(context: OliviaContextSnapshot, workspace: "quote" | "conti") {
  if (context.activeWorkspace !== workspace || !context.activeResourceId) {
    throw new Error(`먼저 수정할 ${workspace === "quote" ? "견적서" : "콘티"}를 열어주세요.`);
  }
  return context.activeResourceId;
}

async function loadQuote(id: string) {
  const db = getSupabaseAdmin();
  const { data, error } = await db.from("quotes").select("*").eq("id", id).maybeSingle();
  if (error || !data) throw new Error("현재 견적서를 불러오지 못했어요.");
  return data as Record<string, unknown>;
}

async function saveQuote(id: string, data: Record<string, unknown>) {
  const db = getSupabaseAdmin();
  const { data: updated, error } = await db.from("quotes").update(data).eq("id", id).select("*").single();
  if (error || !updated) throw new Error("견적서를 저장하지 못했어요.");
  return updated as Record<string, unknown>;
}

async function loadConti(id: string) {
  const db = getSupabaseAdmin();
  const { data, error } = await db.from("conti_saves").select("*").eq("id", id).maybeSingle();
  if (error || !data) throw new Error("현재 콘티를 불러오지 못했어요.");
  return data as Record<string, unknown>;
}

async function saveConti(id: string, result: unknown) {
  const db = getSupabaseAdmin();
  const { data: updated, error } = await db.from("conti_saves")
    .update({ result, saved_at: new Date().toISOString() })
    .eq("id", id).select("*").single();
  if (error || !updated) throw new Error("콘티를 저장하지 못했어요.");
  return updated as Record<string, unknown>;
}

function quoteTarget(quote: Record<string, unknown>, input: Record<string, unknown>, context: OliviaContextSnapshot) {
  const selected = context.selectedEntityType === "quote-item" ? context.selectedEntityId : undefined;
  const matches = resolveQuoteItem(quote.items, text(input, "selector"), selected);
  if (matches.length !== 1) {
    const choices = matches.map(({ item }) => item.name).join(", ");
    throw new Error(choices ? `대상 항목이 여러 개예요: ${choices}` : "수정할 견적 항목을 찾지 못했어요.");
  }
  return matches[0];
}

function contiTarget(conti: Record<string, unknown>, input: Record<string, unknown>, context: OliviaContextSnapshot) {
  const rawPosition = input.position;
  const position = rawPosition == null ? undefined : parseShotPosition(String(rawPosition));
  const selected = context.selectedEntityType === "conti-shot" ? context.selectedEntityId : undefined;
  const matches = resolveContiShot(conti.result, { shotId: selected, selector: text(input, "selector"), position });
  if (matches.length !== 1) {
    const choices = matches.map(({ shot }, index) => shot.keyword || shot.category || `${index + 1}번 컷`).join(", ");
    throw new Error(choices ? `대상 컷이 여러 개예요: ${choices}` : "수정할 콘티 컷을 찾지 못했어요.");
  }
  return matches[0];
}

export async function runTool(
  name: string,
  input: Record<string, unknown>,
  context: OliviaContextSnapshot,
): Promise<OliviaToolResult> {
  const db = getSupabaseAdmin();

  if (name === "select_project") return selectProject(text(input, "hospitalName"));

  if (name === "create_quote") {
    const hospitalName = text(input, "hospitalName") || context.activeClientName;
    if (!hospitalName) throw new Error("견적을 만들 고객을 먼저 알려주세요.");
    const quoteData = buildAgentQuoteData({ ...input, hospitalName }, context.activeProjectId);
    const execution = await executeOliviaCrud(db, {
      operation: "create",
      domain: "quote",
      data: quoteData,
      requestText: `${hospitalName} 견적 생성`,
    });
    const record = execution.record || {};
    return {
      tool: name,
      success: true,
      data: {
        quoteId: execution.recordId,
        resourceId: execution.recordId,
        totalAmount: record.total_amount,
        hospitalName: record.hospital_name,
        clientId: record.client_id,
        workflowRunId: record.workflow_run_id,
      },
    };
  }

  if (name === "create_contract") {
    const hospitalName = text(input, "hospitalName") || context.activeClientName;
    if (!hospitalName) throw new Error("계약서를 만들 고객을 먼저 알려주세요.");
    const quote = await latestResource("quote", { ...context, activeClientName: hospitalName });
    if (!quote) throw new Error("계약서의 기준이 될 견적서를 먼저 만들어주세요.");
    const execution = await executeOliviaCrud(db, {
      operation: "create",
      domain: "contract",
      data: {
        quoteNumber: quote.quote_number,
        hospitalName,
        contactName: quote.contact_name,
        email: quote.email,
        quoteData: quote,
        workflowRunId: context.activeProjectId,
      },
      requestText: `${hospitalName} 계약서 생성`,
    });
    const record = execution.record || {};
    return {
      tool: name,
      success: true,
      data: {
        contractId: execution.recordId,
        resourceId: execution.recordId,
        hospitalName: record.hospital_name,
        clientId: record.client_id || context.activeClientId,
        workflowRunId: record.workflow_run_id || context.activeProjectId,
      },
    };
  }

  if (name === "create_conti") {
    const hospitalName = text(input, "hospitalName") || context.activeClientName;
    if (!hospitalName) throw new Error("콘티를 만들 고객을 먼저 알려주세요.");
    const specialties = Array.isArray(input.specialties)
      ? input.specialties.filter((item): item is string => typeof item === "string")
      : [];
    const execution = await executeOliviaCrud(db, {
      operation: "create",
      domain: "conti",
      data: {
        hospitalName,
        title: text(input, "title") || `${hospitalName} 촬영 콘티`,
        specialties,
        result: { conti: [], checklist: [], schedule: [] },
        clientId: context.activeClientId,
        workflowRunId: context.activeProjectId,
      },
      requestText: `${hospitalName} 콘티 생성`,
    });
    const record = execution.record || {};
    return {
      tool: name,
      success: true,
      data: {
        contiId: execution.recordId,
        resourceId: execution.recordId,
        hospitalName: record.hospital_name,
        clientId: context.activeClientId,
        workflowRunId: context.activeProjectId,
      },
    };
  }

  if (name === "update_quote_item") {
    const resourceId = activeResource(context, "quote");
    const quote = await loadQuote(resourceId);
    const target = quoteTarget(quote, input, context);
    const amount = input.amount == null ? undefined : parseKoreanMoney(input.amount as string | number);
    const quantity = input.quantity == null ? undefined : parseKoreanCount(input.quantity as string | number);
    if (input.amount != null && amount === undefined) throw new Error("변경할 금액을 확인해주세요.");
    if (input.quantity != null && quantity === undefined) throw new Error("변경할 수량을 확인해주세요.");
    const mutation = updateQuoteItem(quote.items, target.index, {
      unitPrice: amount,
      qty: quantity,
      detail: input.description == null ? undefined : String(input.description),
      note: input.note == null ? undefined : String(input.note),
    });
    const amounts = recalculateQuote(mutation.items, quote);
    const updatedResource = await saveQuote(resourceId, { items: mutation.items, form_state: { ...((quote.form_state && typeof quote.form_state === "object") ? quote.form_state as Record<string, unknown> : {}), agentOverrideItems: true }, ...{
      supply_amount: amounts.supplyAmount, vat: amounts.vat, total_amount: amounts.totalAmount,
      deposit_amount: amounts.depositAmount, balance_amount: amounts.balanceAmount,
    } });
    return {
      tool: name,
      success: true,
      data: {
        quoteId: resourceId,
        resourceId,
        changedEntityId: mutation.after.id || `quote-item:${target.index + 1}`,
        item: mutation.after,
        before: mutation.before,
        updatedResource,
        summary: `${mutation.after.name} 항목을 수정했어요.`,
        totalAmount: amounts.totalAmount,
      },
    };
  }

  if (name === "add_quote_item") {
    const resourceId = activeResource(context, "quote");
    const quote = await loadQuote(resourceId);
    const amount = input.unitPrice == null ? undefined : parseKoreanMoney(input.unitPrice as string | number);
    if (amount === undefined) throw new Error(`${text(input, "name")} 항목의 단가를 알려주세요. 임의 금액은 적용하지 않을게요.`);
    const quantity = input.quantity == null ? 1 : parseKoreanCount(input.quantity as string | number);
    if (!quantity) throw new Error("추가할 수량을 확인해주세요.");
    const mutation = addQuoteItem(quote.items, { id: `agent:${crypto.randomUUID()}`, name: text(input, "name"), unitPrice: amount, qty: quantity, detail: text(input, "description"), note: text(input, "note") });
    const amounts = recalculateQuote(mutation.items, quote);
    const updatedResource = await saveQuote(resourceId, { items: mutation.items, form_state: { ...((quote.form_state && typeof quote.form_state === "object") ? quote.form_state as Record<string, unknown> : {}), agentOverrideItems: true }, supply_amount: amounts.supplyAmount, vat: amounts.vat, total_amount: amounts.totalAmount, deposit_amount: amounts.depositAmount, balance_amount: amounts.balanceAmount });
    return { tool: name, success: true, data: { resourceId, quoteId: resourceId, changedEntityId: mutation.created.id, updatedResource, summary: `${mutation.created.name} 항목을 추가했어요.`, totalAmount: amounts.totalAmount } };
  }

  if (name === "remove_quote_item") {
    const resourceId = activeResource(context, "quote");
    const quote = await loadQuote(resourceId);
    const target = quoteTarget(quote, input, context);
    const mutation = removeQuoteItem(quote.items, target.index);
    const amounts = recalculateQuote(mutation.items, quote);
    const updatedResource = await saveQuote(resourceId, { items: mutation.items, form_state: { ...((quote.form_state && typeof quote.form_state === "object") ? quote.form_state as Record<string, unknown> : {}), agentOverrideItems: true }, supply_amount: amounts.supplyAmount, vat: amounts.vat, total_amount: amounts.totalAmount, deposit_amount: amounts.depositAmount, balance_amount: amounts.balanceAmount });
    return { tool: name, success: true, data: { resourceId, quoteId: resourceId, changedEntityId: mutation.removed.id, before: mutation.removed, updatedResource, summary: `${mutation.removed.name} 항목을 뺐어요.`, totalAmount: amounts.totalAmount } };
  }

  if (name === "update_quote_note") {
    const resourceId = activeResource(context, "quote");
    const quote = await loadQuote(resourceId);
    const note = text(input, "note");
    const formState = { ...((quote.form_state && typeof quote.form_state === "object") ? quote.form_state as Record<string, unknown> : {}), memo: note };
    const updatedResource = await saveQuote(resourceId, { memos: note, form_state: formState });
    return { tool: name, success: true, data: { resourceId, quoteId: resourceId, before: quote.memos, updatedResource, summary: "견적 메모를 수정했어요." } };
  }

  if (name === "apply_quote_discount") {
    const resourceId = activeResource(context, "quote");
    const quote = await loadQuote(resourceId);
    const items = Array.isArray(quote.items) ? quote.items as QuoteItem[] : [];
    const subtotal = items.reduce((sum, item) => sum + (Number(item.subtotal) || 0), 0);
    const amount = input.remove ? 0 : input.percent != null ? Math.round(subtotal * Number(input.percent) / 100) : parseKoreanMoney(input.amount as string | number);
    if (amount === undefined || amount < 0) throw new Error("할인 금액을 확인해주세요.");
    const amounts = recalculateQuote(items, quote, amount);
    const updatedResource = await saveQuote(resourceId, { discount_amount: amount, form_state: { ...((quote.form_state && typeof quote.form_state === "object") ? quote.form_state as Record<string, unknown> : {}), extraDiscount: amount }, supply_amount: amounts.supplyAmount, vat: amounts.vat, total_amount: amounts.totalAmount, deposit_amount: amounts.depositAmount, balance_amount: amounts.balanceAmount });
    return { tool: name, success: true, data: { resourceId, quoteId: resourceId, discountAmount: amount, updatedResource, summary: amount ? `${amount.toLocaleString("ko-KR")}원 할인을 적용했어요.` : "할인을 제거했어요.", totalAmount: amounts.totalAmount } };
  }

  if (name === "update_quote_vat_mode") {
    const resourceId = activeResource(context, "quote");
    const quote = await loadQuote(resourceId);
    const mode = text(input, "mode");
    const formState = { ...((quote.form_state && typeof quote.form_state === "object") ? quote.form_state as Record<string, unknown> : {}), vatMode: mode };
    const amounts = recalculateQuote(Array.isArray(quote.items) ? quote.items as QuoteItem[] : [], { ...quote, form_state: formState });
    const updatedResource = await saveQuote(resourceId, { form_state: formState, supply_amount: amounts.supplyAmount, vat: amounts.vat, total_amount: amounts.totalAmount, deposit_amount: amounts.depositAmount, balance_amount: amounts.balanceAmount });
    return { tool: name, success: true, data: { resourceId, quoteId: resourceId, vatMode: mode, updatedResource, summary: "VAT 방식을 변경했어요.", totalAmount: amounts.totalAmount } };
  }

  if (name === "rebalance_quote_total") {
    const resourceId = activeResource(context, "quote");
    const quote = await loadQuote(resourceId);
    const targetTotal = parseKoreanMoney(input.targetTotal as string | number);
    if (!targetTotal) throw new Error("목표 총액을 확인해주세요.");
    const currentTotal = Number(quote.total_amount) || 0;
    const items = Array.isArray(quote.items) ? quote.items as QuoteItem[] : [];
    const gross = items.reduce((sum, item) => sum + (Number(item.subtotal) || 0), 0);
    const formState = quote.form_state && typeof quote.form_state === "object" ? quote.form_state as Record<string, unknown> : {};
    const desiredSupply = formState.vatMode === "included" || formState.vatMode === "excluded" ? targetTotal : targetTotal / 1.1;
    const discountAmount = Math.max(0, Math.round(gross - desiredSupply));
    const projected = recalculateQuote(items, quote, discountAmount);
    return { tool: name, success: true, data: { resourceId, quoteId: resourceId, currentTotal, targetTotal, projectedTotal: projected.totalAmount, proposedDiscountAmount: discountAmount, approvalRequired: true, summary: `현재 ${currentTotal.toLocaleString("ko-KR")}원에서 ${discountAmount.toLocaleString("ko-KR")}원 할인을 적용하면 총액은 ${projected.totalAmount.toLocaleString("ko-KR")}원입니다. 적용할까요?` } };
  }

  if (name === "apply_quote_rebalance") {
    return runTool("apply_quote_discount", { amount: input.discountAmount, percent: null, remove: false }, context);
  }

  if (name === "preview_quote") {
    const resourceId = activeResource(context, "quote");
    return { tool: name, success: true, data: { resourceId, quoteId: resourceId, summary: "견적 미리보기를 열었어요." } };
  }

  if (name === "request_quote_publish") {
    const resourceId = activeResource(context, "quote");
    const quote = await loadQuote(resourceId);
    return { tool: name, success: true, data: { resourceId, quoteId: resourceId, approvalRequired: true, hospitalName: quote.hospital_name, totalAmount: quote.total_amount, quoteNumber: quote.quote_number, summary: `${quote.hospital_name || "현재 고객"} 견적 ${quote.quote_number || ""}, 총액 ${Number(quote.total_amount || 0).toLocaleString("ko-KR")}원을 고객 포털에 공개할까요?` } };
  }

  if (name === "publish_quote") {
    const resourceId = activeResource(context, "quote");
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://127.0.0.1:3000";
    const response = await fetch(`${baseUrl}/api/quotes/${resourceId}/publish`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    const payload = await response.json();
    if (!response.ok || !payload.ok) throw new Error(payload.error || "견적서를 공개하지 못했어요.");
    return { tool: name, success: true, data: { resourceId, quoteId: resourceId, ...payload, summary: "견적서를 고객 포털에 공개했어요." } };
  }

  if (["add_conti_shots", "update_conti_shot", "remove_conti_shot", "apply_remove_conti_shot", "reorder_conti_shot", "duplicate_conti_shot", "estimate_conti_duration", "generate_shoot_prep_from_conti"].includes(name)) {
    const resourceId = activeResource(context, "conti");
    const conti = await loadConti(resourceId);
    if (name === "add_conti_shots") {
      const count = parseKoreanCount(input.count as string | number);
      if (!count) throw new Error("추가할 컷 수를 확인해주세요.");
      const selected = context.selectedEntityType === "conti-shot" ? resolveContiShot(conti.result, { shotId: context.selectedEntityId })[0] : undefined;
      const mutation = addContiShots(conti.result, { count, shotType: text(input, "shotType"), description: text(input, "description") || undefined, insertAfter: selected?.index });
      const updatedResource = await saveConti(resourceId, mutation.result);
      return { tool: name, success: true, data: { resourceId, contiId: resourceId, changedEntityId: mutation.created[0]?.id, updatedResource, summary: `${text(input, "shotType")}컷 ${count}개를 추가했어요.` } };
    }
    if (name === "estimate_conti_duration") {
      const estimate = estimateContiDuration(conti.result);
      return { tool: name, success: true, data: { resourceId, ...estimate, summary: `${estimate.shotCount}컷 기준 약 ${estimate.minMinutes}~${estimate.maxMinutes}분으로 예상돼요.${estimate.basedOnExplicitDuration ? "" : " 컷당 10분 기준 추정값이에요."}` } };
    }
    if (name === "generate_shoot_prep_from_conti") {
      const result = normalizeContiResult(conti.result);
      return { tool: name, success: true, data: { resourceId, checklist: result.checklist, locations: [...new Set(result.conti.map((shot) => shot.location).filter(Boolean))], personnel: [...new Set(result.conti.map((shot) => shot.personnel).filter(Boolean))], summary: "현재 콘티와 기존 체크리스트를 기준으로 준비물을 정리했어요." } };
    }
    const target = contiTarget(conti, input, context);
    if (name === "remove_conti_shot") {
      return { tool: name, success: true, data: { resourceId, contiId: resourceId, targetIndex: target.index, changedEntityId: target.shot.id || `shot:${target.index + 1}`, approvalRequired: true, summary: `${target.index + 1}번 ${target.shot.keyword || target.shot.category || "컷"}을 삭제할까요?` } };
    }
    if (name === "apply_remove_conti_shot") {
      const mutation = removeContiShot(conti.result, target.index);
      const updatedResource = await saveConti(resourceId, mutation.result);
      return { tool: name, success: true, data: { resourceId, contiId: resourceId, before: mutation.removed, updatedResource, summary: `${target.index + 1}번 컷을 삭제했어요.` } };
    }
    if (name === "update_conti_shot") {
      const changes = Object.fromEntries(["category", "duration", "location", "cameraAngle", "keyword", "description", "personnel", "notes"].flatMap((key) => input[key] == null ? [] : [[key, String(input[key])]]));
      const mutation = updateContiShot(conti.result, target.index, changes);
      const updatedResource = await saveConti(resourceId, mutation.result);
      return { tool: name, success: true, data: { resourceId, contiId: resourceId, changedEntityId: mutation.after.id || `shot:${target.index + 1}`, before: mutation.before, updatedResource, summary: `${target.index + 1}번 컷을 수정했어요.` } };
    }
    if (name === "duplicate_conti_shot") {
      const mutation = duplicateContiShot(conti.result, target.index);
      const updatedResource = await saveConti(resourceId, mutation.result);
      return { tool: name, success: true, data: { resourceId, contiId: resourceId, changedEntityId: mutation.created.id, updatedResource, summary: `${target.index + 1}번 컷을 복제했어요.` } };
    }
    const targetPosition = text(input, "targetPosition") === "맨앞" ? 0 : parseShotPosition(input.targetPosition as string | number);
    if (targetPosition === undefined) throw new Error("이동할 위치를 확인해주세요.");
    const mutation = reorderContiShot(conti.result, target.index, targetPosition);
    const updatedResource = await saveConti(resourceId, mutation.result);
    return { tool: name, success: true, data: { resourceId, contiId: resourceId, changedEntityId: mutation.moved.id || `shot:${mutation.to + 1}`, updatedResource, summary: `${target.index + 1}번 컷을 ${mutation.to + 1}번으로 이동했어요.` } };
  }

  if (name === "show_workspace") {
    const workspace = text(input, "workspace") as "quote" | "contract" | "conti";
    if (!(["quote", "contract", "conti"] as const).includes(workspace)) throw new Error("지원하지 않는 작업 화면이에요.");
    const resource = await latestResource(workspace, context);
    if (!resource?.id) throw new Error(`현재 프로젝트의 ${workspaceLabel(workspace)}를 찾지 못했어요.`);
    return {
      tool: name,
      success: true,
      data: { workspace, resourceId: String(resource.id) },
    };
  }

  throw new Error("지원하지 않는 Olivia 작업이에요.");
}

export async function executeAgentTool(
  toolCall: OliviaToolCall,
  context: OliviaContextSnapshot,
): Promise<OliviaAgentToolExecution> {
  let input: Record<string, unknown>;
  try {
    const parsed = JSON.parse(toolCall.arguments || "{}");
    input = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return { result: { tool: toolCall.name, success: false, error: "작업 입력을 이해하지 못했어요." }, uiActions: [] };
  }

  try {
    const result = await runTool(toolCall.name, input, context);
    const uiActions = await resolveUiActions({ toolCall, input, result, context });
    return { result, uiActions };
  } catch (error) {
    return {
      result: {
        tool: toolCall.name,
        success: false,
        error: error instanceof Error ? error.message : "작업을 완료하지 못했어요.",
      },
      uiActions: [],
    };
  }
}

// Compatibility export for tests and any pre-existing v2 imports.
export const executeOliviaV2Tool = async (
  name: string,
  input: Record<string, unknown>,
  context: OliviaContextSnapshot,
) => executeAgentTool({ id: crypto.randomUUID(), name, arguments: JSON.stringify(input) }, context);
