import { getSupabaseAdmin } from "@/lib/supabase";
import { executeOliviaCrud } from "@/lib/olivia/crud/executor";
import { formatIncludedService, type QuoteIncludedService } from "@/lib/quote/agentQuote";
import { parseQuoteRequest } from "@/lib/quote/quoteRequestParser";
import { buildQuoteDataFromParsedRequest } from "@/lib/quote/quoteRequestData";
import { parseKoreanCount, parseKoreanMoney, parseKoreanPercent, resolveOrdinalReference } from "@/lib/olivia/naturalLanguageNumbers";
import { addQuoteItem, quoteItems, recalculateQuote, removeQuoteItem, resolveQuoteItem, updateQuoteItem, type QuoteItem } from "@/lib/quote/quoteMutationService";
import { linkNewClientToQuote, resolveQuoteClient } from "@/lib/olivia/tools/quoteClientLink";
import type { OliviaContextSnapshot, OliviaToolResult } from "@/lib/olivia/v2/types";
import { text, activeResource } from "./common";
import { createVerification } from "./verification";
import { isKnownDocumentBrand } from "@/lib/olivia/brandResolver";
import { renderQuoteBuffer } from "@/lib/quote/renderQuotePdf";
import { resolveServerBaseUrl } from "@/lib/baseUrl";
import { publishQuote } from "@/lib/core/commands/document";
import { OliviaToolError } from "@/lib/olivia/v2/toolError";
import { archiveWorkflowPdf } from "@/lib/workflowArtifacts/archivePdf";
import { registerTemporaryDocument } from "@/lib/olivia/documents/temporaryDocuments";
import {
  buildQuoteCreateRequestKey,
  findRecentQuoteByCreateRequestKey,
  stampQuoteCreateRequestKey,
} from "@/lib/quote/quoteCreateIdempotency";

// request_quote_publish(승인 요청)와 publish_quote(완료 보고) 둘 다 항목별 요약이 필요해서
// 뽑아냈다(스펙 §19-22) — 금액은 전부 quotes 테이블에 이미 저장된 실제 값이고 여기서
// 새로 계산하지 않는다.
export function buildQuoteBreakdownLines(quote: Record<string, unknown>): string[] {
  const won = (value: unknown) => `${(Number(value) || 0).toLocaleString("ko-KR")}원`;
  const items = Array.isArray(quote.items) ? (quote.items as Array<Record<string, unknown>>) : [];
  const itemLines = items.map((item) => `- ${item.name}${item.detail ? ` (${item.detail})` : ""}`);
  const discountAmount = Number(quote.discount_amount) || 0;
  return [
    ...itemLines,
    discountAmount > 0 ? `할인: ${won(discountAmount)}` : null,
    `최종 금액: ${won(quote.total_amount)}`,
  ].filter((line): line is string => line !== null);
}

export async function loadQuote(id: string) {
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

function quoteTarget(quote: Record<string, unknown>, input: Record<string, unknown>, context: OliviaContextSnapshot) {
  const selected = context.selectedRowId
    || (context.selectedEntityType === "quote-item" ? context.selectedEntityId : undefined);
  const rawPosition = input.position;
  const position = rawPosition == null ? undefined : resolveOrdinalReference(String(rawPosition), quoteItems(quote.items).length);
  const matches = resolveQuoteItem(quote.items, text(input, "selector"), selected, position);
  if (matches.length !== 1) {
    const choices = matches.map(({ item }) => item.name).join(", ");
    throw new Error(choices ? `대상 항목이 여러 개예요: ${choices}` : "수정할 견적 항목을 찾지 못했어요.");
  }
  return matches[0];
}

function quoteFormState(quote: Record<string, unknown>) {
  return quote.form_state && typeof quote.form_state === "object" && !Array.isArray(quote.form_state)
    ? quote.form_state as Record<string, any>
    : {};
}

function quoteDiscountAmount(items: QuoteItem[], quote: Record<string, unknown>, formState = quoteFormState(quote)) {
  const discount = formState.discount && typeof formState.discount === "object"
    ? formState.discount as Record<string, unknown>
    : null;
  if (discount?.type === "percent") {
    const subtotal = items.reduce((sum, item) => sum + Math.max(0, Number(item.subtotal) || 0), 0);
    return Math.round(subtotal * Math.min(100, Math.max(0, Number(discount.value) || 0)) / 100);
  }
  return Number(quote.discount_amount) || 0;
}

async function finalizeCreatedQuote(input: {
  db: ReturnType<typeof getSupabaseAdmin>;
  toolName: string;
  quoteId: string;
  record: Record<string, unknown>;
  fallbackHospitalName: string;
  fallbackClientId?: string;
  fallbackWorkflowRunId?: string;
  reused: boolean;
}): Promise<OliviaToolResult> {
  const {
    db, toolName, quoteId, record, fallbackHospitalName,
    fallbackClientId, fallbackWorkflowRunId, reused,
  } = input;
  const hospitalName = String(record.hospital_name || fallbackHospitalName);
  const registered = await registerTemporaryDocument(db, {
    documentType: "quote",
    sourceTable: "quotes",
    sourceId: quoteId,
    title: String(record.title || `${hospitalName} 견적서`),
    hospitalName,
    clientId: typeof record.client_id === "string" ? record.client_id : fallbackClientId,
    workflowRunId: typeof record.workflow_run_id === "string" ? record.workflow_run_id : fallbackWorkflowRunId,
    metadata: { totalAmount: Number(record.total_amount) || 0, quoteNumber: record.quote_number || null },
  });
  const temporaryDocument = registered.temporaryDocument;
  return {
    tool: toolName,
    success: true,
    data: {
      quoteId,
      resourceId: quoteId,
      totalAmount: record.total_amount,
      hospitalName,
      clientId: temporaryDocument.client_id,
      workflowRunId: temporaryDocument.workflow_run_id,
      temporaryDocumentId: temporaryDocument.id,
      temporaryDocumentStatus: temporaryDocument.status,
      clientResolution: registered.clientResolution,
      deduplicated: reused,
      summary: reused
        ? `${hospitalName} 견적서는 이미 생성되어 있어 기존 문서를 열었어요.`
        : temporaryDocument.status === "linked"
          ? `${hospitalName} 견적서를 저장하고 기존 고객에게 연결했어요.`
          : `${hospitalName} 견적서를 임시문서함에 저장했어요. 내용을 확인해주세요.`,
    },
    verification: createVerification({
      executed: true,
      persisted: true,
      resourceExists: true,
      linked: temporaryDocument.status === "linked",
      details: {
        temporaryDocumentId: temporaryDocument.id,
        temporaryDocumentStatus: temporaryDocument.status,
        deduplicated: reused,
      },
    }),
  };
}

function serviceType(value: unknown): QuoteIncludedService["type"] | undefined {
  return (["profile", "staged", "group", "interior", "video", "other"] as const)
    .find((candidate) => candidate === value);
}

function serviceCount(value: unknown, current: number | null | undefined) {
  if (value == null) return current ?? null;
  return parseKoreanCount(value as string | number) ?? current ?? null;
}

export const QUOTE_TOOL_NAMES = [
  "create_quote", "get_quote", "start_quote_wizard", "update_quote_item", "add_quote_item", "remove_quote_item",
  "update_quote_note", "update_quote_info", "update_quote_payment_terms", "update_quote_service", "apply_quote_discount", "update_quote_vat_mode",
  "preview_quote", "request_quote_publish",
  "download_quote_pdf", "publish_quote", "resolve_quote_client", "link_new_client_to_quote",
] as const;

const MEDICAL_CLIENT_PATTERN = /(병원|의원|클리닉|메디컬|의료재단|검진센터|요양병원|한의원|한방|내과|외과|정형외과|신경외과|성형외과|흉부외과|피부과|안과|이비인후과|산부인과|소아과|소아청소년과|비뇨기과|비뇨의학과|정신건강의학과|신경과|재활의학과|영상의학과|마취통증의학과|가정의학과|응급의학과|치과|교정과|구강내과|구강외과|치주과|보철과|헬스|health|메디|medical|medi|닥터|doctor|\bdr\b|의료|의학|웰니스|재활|통증|임플란트|약국|제약|바이오)/i;

async function resolveCreateQuoteContext(input: {
  db: ReturnType<typeof getSupabaseAdmin>;
  requestText: string;
  clientName: string;
  modelBrand: unknown;
}) {
  const explicitBrand: "photoclinic" | "jakeimage" | null = /포토\s*클리닉(?:으로|로)?/.test(input.requestText)
    ? "photoclinic"
    : /제이크\s*이미지(?:연구소)?(?:으로|로)?/i.test(input.requestText)
      ? "jakeimage"
      : input.modelBrand === "jakeimage" || input.modelBrand === "photoclinic"
        ? input.modelBrand
        : null;
  // 단위 테스트나 제한된 오프라인 실행처럼 DB adapter가 없는 경우에는 고객 연결만 생략한다.
  // 실서비스 Supabase에서는 항상 아래 exact lookup을 실행하며, 실패를 무시하지 않는다.
  if (typeof (input.db as unknown as { from?: unknown }).from !== "function") {
    return {
      brand: explicitBrand || (MEDICAL_CLIENT_PATTERN.test(input.clientName) ? "photoclinic" : "jakeimage"),
      clientId: undefined,
      workflowRunId: undefined,
    };
  }
  const { data: client, error } = await input.db
    .from("clients")
    .select("id,hospital_name")
    .eq("hospital_name", input.clientName)
    .maybeSingle();
  if (error) throw new Error(`고객 연결 정보를 확인하지 못했어요: ${error.message}`);
  const clientId = client?.id ? String(client.id) : undefined;
  let previousBrand: "photoclinic" | "jakeimage" | null = null;
  if (clientId) {
    const { data: previous, error: previousError } = await input.db
      .from("quotes")
      .select("form_state")
      .eq("client_id", clientId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (previousError) throw new Error(`이전 견적서 브랜드를 확인하지 못했어요: ${previousError.message}`);
    const state = previous?.form_state && typeof previous.form_state === "object" ? previous.form_state as Record<string, unknown> : {};
    previousBrand = state.brand === "jakeimage" || state.brand === "photoclinic" ? state.brand : null;
  }
  let workflowRunId: string | undefined;
  if (clientId) {
    const { data: run, error: runError } = await input.db.from("workflow_runs")
      .select("id").eq("client_id", clientId).eq("status", "active").order("updated_at", { ascending: false }).limit(1).maybeSingle();
    if (runError) throw new Error(`고객 프로젝트를 확인하지 못했어요: ${runError.message}`);
    workflowRunId = run?.id ? String(run.id) : undefined;
  }
  const brand = explicitBrand || previousBrand || (MEDICAL_CLIENT_PATTERN.test(input.clientName) ? "photoclinic" : "jakeimage");
  return { brand, clientId, workflowRunId };
}

function quoteParseNotices(input: {
  parsed: ReturnType<typeof parseQuoteRequest>;
  brand: "photoclinic" | "jakeimage";
}) {
  const notices = [`${input.brand === "photoclinic" ? "포토클리닉" : "제이크이미지연구소"}로 만들었어요.`];
  if (input.parsed.emailCorrectedFrom && input.parsed.email) {
    notices.push(`이메일을 ${input.parsed.email.split("@")[1]}으로 고쳤어요.`);
  }
  for (const item of input.parsed.items.filter((item) => item.amount === null && !item.free)) {
    notices.push(`${item.name} — 금액 입력 필요`);
  }
  for (const line of input.parsed.unparsedLines) {
    notices.push(`이 줄은 못 읽었어요 — "${line}" / 어디에 넣을지 알려주세요`);
  }
  return notices;
}

function addQuoteParseNotices(result: OliviaToolResult, notices: string[]) {
  if (!result.success || !result.data) return result;
  const summary = typeof result.data.summary === "string" ? result.data.summary : "견적서를 만들었어요.";
  return { ...result, data: { ...result.data, parserNotices: notices, summary: [summary, ...notices].join("\n") } };
}

export async function executeQuoteTool(
  name: string,
  input: Record<string, unknown>,
  context: OliviaContextSnapshot,
): Promise<OliviaToolResult> {
  const db = getSupabaseAdmin();

  if (name === "get_quote") {
    const resourceId = text(input, "quoteId") || activeResource(context, "quote");
    const quote = await loadQuote(resourceId);
    return { tool: name, success: true, data: { quoteId: resourceId, resourceId, quote }, verification: createVerification({ executed: true, resourceExists: true }) };
  }

  if (name === "start_quote_wizard") {
    // 서버 작업 없음 — flowId만 발급하면 클라이언트가 그 값으로 채팅 카드/스토어를 초기화한다
    // (start_select_match_flow와 동일한 패턴, 견적서 UX 개편 2026-08-31).
    return {
      tool: name,
      success: true,
      data: {
        flowId: crypto.randomUUID(),
        ...(isKnownDocumentBrand(context.brand) ? { brand: context.brand } : {}),
      },
      verification: createVerification({ executed: true }),
    };
  }

  if (name === "create_quote") {
    const requestText = context.currentRequestText?.trim();
    if (!requestText) throw new Error("이번 견적 요청 원문을 찾지 못했어요. 다시 한 번 보내주세요.");
    const parsed = parseQuoteRequest(requestText);
    if (!parsed.clientName) throw new Error("견적서를 만들 고객명을 원문에서 찾지 못했어요.");
    const createContext = await resolveCreateQuoteContext({
      db, requestText, clientName: parsed.clientName, modelBrand: input.brand,
    });
    const hospitalName = parsed.clientName;
    const clientId = createContext.clientId;
    const workflowRunId = createContext.workflowRunId;
    let quoteData: Record<string, unknown> = buildQuoteDataFromParsedRequest({
      request: parsed,
      brand: createContext.brand,
      clientId,
      workflowRunId,
    });
    const createRequestKey = buildQuoteCreateRequestKey(context, quoteData);
    if (createRequestKey) {
      quoteData = stampQuoteCreateRequestKey(quoteData, createRequestKey);
      const existing = await findRecentQuoteByCreateRequestKey(db, createRequestKey);
      if (existing?.id) {
        return addQuoteParseNotices(await finalizeCreatedQuote({
          db,
          toolName: name,
          quoteId: String(existing.id),
          record: existing,
          fallbackHospitalName: hospitalName,
          fallbackClientId: clientId,
          fallbackWorkflowRunId: workflowRunId,
          reused: true,
        }), quoteParseNotices({ parsed, brand: createContext.brand }));
      }
    }
    const execution = await executeOliviaCrud(db, {
      operation: "create",
      domain: "quote",
      data: quoteData,
      requestText: `${hospitalName} 견적 생성`,
    });
    const record = execution.record || {};
    // executeOliviaCrud의 create는 insert().select().single()로 실제 저장된 row를 돌려받는다.
    return addQuoteParseNotices(await finalizeCreatedQuote({
      db,
      toolName: name,
      quoteId: execution.recordId,
      record,
      fallbackHospitalName: hospitalName,
      fallbackClientId: clientId,
      fallbackWorkflowRunId: workflowRunId,
      reused: false,
    }), quoteParseNotices({ parsed, brand: createContext.brand }));
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
    const existingFormState = quoteFormState(quote);
    const isCustomPrimary = mutation.after.id === "custom:primary";
    const formState = {
      ...existingFormState,
      agentOverrideItems: true,
      ...(isCustomPrimary ? {
        pricingMode: mutation.after.qty > 1 ? "custom_unit" : existingFormState.pricingMode,
        pricing: {
          ...(existingFormState.pricing && typeof existingFormState.pricing === "object" ? existingFormState.pricing : {}),
          quantity: mutation.after.qty,
          unitPrice: mutation.after.unitPrice,
        },
      } : {}),
    };
    const discountAmount = quoteDiscountAmount(mutation.items, quote, formState);
    const amounts = recalculateQuote(mutation.items, { ...quote, form_state: formState }, discountAmount);
    const updatedResource = await saveQuote(resourceId, { items: mutation.items, discount_amount: discountAmount, form_state: formState, ...{
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
      // saveQuote가 실패하면 이미 위에서 throw했으므로, 여기 도달했다는 것 자체가 실제 저장
      // 확인이다 — LLM이 계산한 amounts가 아니라 updatedResource(실제 DB round-trip 결과)의
      // 값을 verification details로 남긴다(스펙 §14).
      verification: createVerification({ executed: true, persisted: true, resourceExists: true, details: { totalAmount: Number(updatedResource.total_amount) } }),
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
    const formState = { ...quoteFormState(quote), agentOverrideItems: true };
    const discountAmount = quoteDiscountAmount(mutation.items, quote, formState);
    const amounts = recalculateQuote(mutation.items, { ...quote, form_state: formState }, discountAmount);
    const updatedResource = await saveQuote(resourceId, { items: mutation.items, discount_amount: discountAmount, form_state: formState, supply_amount: amounts.supplyAmount, vat: amounts.vat, total_amount: amounts.totalAmount, deposit_amount: amounts.depositAmount, balance_amount: amounts.balanceAmount });
    return {
      tool: name, success: true,
      data: { resourceId, quoteId: resourceId, changedEntityId: mutation.created.id, updatedResource, summary: `${mutation.created.name} 항목을 추가했어요.`, totalAmount: amounts.totalAmount },
      verification: createVerification({ executed: true, persisted: true, resourceExists: true, details: { totalAmount: Number(updatedResource.total_amount) } }),
    };
  }

  if (name === "remove_quote_item") {
    const resourceId = activeResource(context, "quote");
    const quote = await loadQuote(resourceId);
    const target = quoteTarget(quote, input, context);
    const mutation = removeQuoteItem(quote.items, target.index);
    const formState = { ...quoteFormState(quote), agentOverrideItems: true };
    const discountAmount = quoteDiscountAmount(mutation.items, quote, formState);
    const amounts = recalculateQuote(mutation.items, { ...quote, form_state: formState }, discountAmount);
    const updatedResource = await saveQuote(resourceId, { items: mutation.items, discount_amount: discountAmount, form_state: formState, supply_amount: amounts.supplyAmount, vat: amounts.vat, total_amount: amounts.totalAmount, deposit_amount: amounts.depositAmount, balance_amount: amounts.balanceAmount });
    return {
      tool: name, success: true,
      data: { resourceId, quoteId: resourceId, changedEntityId: mutation.removed.id, before: mutation.removed, updatedResource, summary: `${mutation.removed.name} 항목을 뺐어요.`, totalAmount: amounts.totalAmount },
      // 삭제 대상 자체는 이제 존재하지 않는다는 것을 details에 명확히 남긴다(스펙 §15) — quote
      // 리소스 자체는 여전히 존재하므로 최상위 resourceExists는 true로 둔다.
      verification: createVerification({ executed: true, persisted: true, resourceExists: true, details: { removedItemExists: false } }),
    };
  }

  if (name === "update_quote_note") {
    const resourceId = activeResource(context, "quote");
    const quote = await loadQuote(resourceId);
    const note = text(input, "note");
    const formState = { ...((quote.form_state && typeof quote.form_state === "object") ? quote.form_state as Record<string, unknown> : {}), memo: note };
    const updatedResource = await saveQuote(resourceId, { memos: note, form_state: formState });
    return {
      tool: name, success: true,
      data: { resourceId, quoteId: resourceId, before: quote.memos, updatedResource, summary: "견적 메모를 수정했어요." },
      verification: createVerification({ executed: true, persisted: true, resourceExists: true }),
    };
  }

  if (name === "update_quote_info") {
    const resourceId = activeResource(context, "quote");
    const quote = await loadQuote(resourceId);
    // 견적 항목/금액은 add_quote_item 등 전용 도구가 recalculateQuote()를 거쳐 처리하지만,
    // 병원명·담당자·연락처처럼 계산과 무관한 기본 정보는 그런 도구가 없어서 GPT가
    // create_feature_record/update_feature_record(domain:"quote")로 넘어갔고, quote는 그
    // 범용 경로에서 명시적으로 막혀 있어 "직접 수정할 수 없다"는 에러로 이어졌다
    // (2026-08-30 사용자 리포트). items/formState 전체를 여는 대신 이 안전한 필드만 딱
    // 열어주는 전용 도구를 추가한다.
    const columnMap: Array<[string, string]> = [
      ["hospitalName", "hospital_name"],
      ["contactName", "contact_name"],
      ["phone", "phone"],
      ["email", "email"],
      ["quoteDate", "quote_date"],
      ["shootDate", "shoot_date"],
      ["validUntil", "valid_until"],
      ["quoteTitle", "title"],
    ];
    const patch: Record<string, string> = {};
    for (const [key, column] of columnMap) {
      const raw = input[key];
      if (raw != null && String(raw).trim()) patch[column] = String(raw).trim();
    }
    if (!Object.keys(patch).length) throw new Error("변경할 내용을 알려주세요.");
    const existingFormState = (quote.form_state && typeof quote.form_state === "object") ? quote.form_state as Record<string, unknown> : {};
    const existingCustomer = (existingFormState.customer && typeof existingFormState.customer === "object") ? existingFormState.customer as Record<string, unknown> : {};
    const nextCustomer = {
      hospitalName: patch.hospital_name ?? existingCustomer.hospitalName ?? quote.hospital_name ?? "",
      managerName: patch.contact_name ?? existingCustomer.managerName ?? quote.contact_name ?? "",
      phone: patch.phone ?? existingCustomer.phone ?? quote.phone ?? "",
      email: patch.email ?? existingCustomer.email ?? quote.email ?? "",
      quoteDate: patch.quote_date ?? existingCustomer.quoteDate ?? quote.quote_date ?? "",
      validUntil: patch.valid_until ?? existingCustomer.validUntil ?? quote.valid_until ?? "",
      shootDate: patch.shoot_date ?? existingCustomer.shootDate ?? quote.shoot_date ?? "",
      quoteNumber: existingCustomer.quoteNumber ?? quote.quote_number ?? "",
    };
    const formState = { ...existingFormState, customer: nextCustomer, ...(patch.title != null ? { quoteTitle: patch.title } : {}) };
    const updatedResource = await saveQuote(resourceId, { ...patch, form_state: formState });
    return {
      tool: name, success: true,
      data: { resourceId, quoteId: resourceId, updatedResource, summary: "견적서 정보를 수정했어요." },
      verification: createVerification({ executed: true, persisted: true, resourceExists: true }),
    };
  }

  if (name === "update_quote_payment_terms") {
    // Olivia OS 채팅/견적서 수정 로직 개선 — "선금 50%, 잔금 50%를 잔금 100%로 바꿔"류 요청이
    // 이 전용 필드 도구가 없어서 update_quote_note(메모)로 잘못 빠졌다(원인 분석 §1/§3). 계약서의
    // update_contract_terms와 정확히 같은 패턴(입력 검증 → 저장 → read-back 강제 검증)을 쓴다 —
    // 새 검증 체계를 만들지 않는다.
    const resourceId = activeResource(context, "quote");
    const quote = await loadQuote(resourceId);
    const rawDeposit = input.depositPercent;
    const rawBalance = input.balancePercent;
    let depositRate: number | undefined;
    if (rawDeposit != null) {
      depositRate = parseKoreanPercent(rawDeposit as string | number);
    } else if (rawBalance != null) {
      const balanceRate = parseKoreanPercent(rawBalance as string | number);
      depositRate = balanceRate == null ? undefined : 100 - balanceRate;
    }
    if (depositRate == null || !Number.isFinite(depositRate) || depositRate < 0 || depositRate > 100) {
      throw new Error("선금/잔금 비율을 0~100 사이로 알려주세요.");
    }
    const amounts = recalculateQuote(quoteItems(quote.items), { ...quote, deposit_rate: depositRate });
    // form_state.depositRate는 deposit_rate 컬럼과 별개로 저장되는 값이라(QuoteBuilder.tsx의
    // 로컬 편집 상태 매핑, lib/quote/quoteRowMapping.ts가 이 값만 읽는다) 컬럼만 바꾸면 화면
    // 편집기는 예전 값을 계속 보여준다 — apply_quote_discount 등 다른 tool과 동일하게 두 곳을
    // 함께 갱신한다(스펙 §5 "UI 즉시 반영").
    const formState = { ...quoteFormState(quote), depositRate };
    const updatedResource = await saveQuote(resourceId, {
      deposit_rate: depositRate,
      deposit_amount: amounts.depositAmount,
      balance_amount: amounts.balanceAmount,
      form_state: formState,
    });
    // deposit_rate=0도 정상 값이므로 == null만 실패로 본다(스펙 §4/§13 TEST 7) — !=(느슨한 비교)로
    // "50" 같은 문자열/숫자 차이까지 실패 처리하지 않는다.
    const savedDepositRate = updatedResource.deposit_rate == null ? null : Number(updatedResource.deposit_rate);
    if (savedDepositRate !== depositRate) {
      throw new Error(`결제 조건 저장 검증이 일치하지 않아요: 요청 ${depositRate}% / 저장 ${savedDepositRate}%`);
    }
    return {
      tool: name,
      success: true,
      data: {
        resourceId,
        quoteId: resourceId,
        updatedResource,
        depositPercent: savedDepositRate,
        balancePercent: 100 - savedDepositRate,
        summary: `결제 조건을 선금 ${savedDepositRate}%, 잔금 ${100 - savedDepositRate}%로 변경했어요.`,
        totalAmount: amounts.totalAmount,
      },
      // 요청값이 아니라 updatedResource(실제 DB round-trip 결과)의 deposit_rate/deposit_amount를
      // verification details로 남긴다(스펙 §14/§6 "실제 결과 확인").
      verification: createVerification({
        executed: true, persisted: true, resourceExists: true,
        details: { depositPercent: savedDepositRate, balancePercent: 100 - savedDepositRate, depositAmount: Number(updatedResource.deposit_amount) || 0, balanceAmount: Number(updatedResource.balance_amount) || 0 },
      }),
    };
  }

  if (name === "update_quote_service") {
    const resourceId = activeResource(context, "quote");
    const quote = await loadQuote(resourceId);
    const formState = quoteFormState(quote);
    const services = Array.isArray(formState.includedServices)
      ? formState.includedServices.map((service: QuoteIncludedService) => ({ ...service }))
      : [];
    const requestedType = serviceType(input.serviceType);
    const selector = text(input, "selector").replace(/\s+/g, "");
    const matches = services.flatMap((service: QuoteIncludedService, index: number) => {
      const typeMatches = requestedType ? service.type === requestedType : false;
      const labelMatches = selector ? service.label.replace(/\s+/g, "").includes(selector) || selector.includes(service.label.replace(/\s+/g, "")) : false;
      return typeMatches || labelMatches ? [{ service, index }] : [];
    });
    if (matches.length !== 1) {
      throw new Error(matches.length > 1 ? "수정할 포함 서비스가 여러 개예요. 서비스 이름을 더 정확히 알려주세요." : "수정할 포함 서비스를 찾지 못했어요.");
    }
    const target = matches[0];
    let nextServices: QuoteIncludedService[];
    if (input.remove) {
      nextServices = services.filter((_: QuoteIncludedService, index: number) => index !== target.index);
    } else {
      const next: QuoteIncludedService = {
        ...target.service,
        type: requestedType || target.service.type,
        label: input.label == null ? target.service.label : String(input.label).trim() || target.service.label,
        personCount: serviceCount(input.personCount, target.service.personCount),
        cutCount: serviceCount(input.cutCount, target.service.cutCount),
        conceptCount: serviceCount(input.conceptCount, target.service.conceptCount),
        deliverableCount: serviceCount(input.deliverableCount, target.service.deliverableCount),
        description: input.description == null ? target.service.description ?? null : String(input.description).trim() || null,
      };
      nextServices = services.map((service: QuoteIncludedService, index: number) => index === target.index ? next : service);
    }
    const paidItems = quoteItems(quote.items).filter((item) => !String(item.id || "").startsWith("service:"));
    const serviceItems: QuoteItem[] = nextServices.map((service, index) => ({
      id: `service:${service.type}:${index}`,
      name: formatIncludedService(service),
      detail: "",
      unitPrice: 0,
      qty: 1,
      subtotal: 0,
      note: "포함 서비스",
    }));
    const items = [...paidItems, ...serviceItems];
    const nextFormState = {
      ...formState,
      includedServices: nextServices,
      benefitItems: nextServices.map((service, index) => ({ id: `service:${service.type}:${index}`, name: formatIncludedService(service) })),
    };
    const updatedResource = await saveQuote(resourceId, { items, form_state: nextFormState });
    return {
      tool: name,
      success: true,
      data: {
        resourceId,
        quoteId: resourceId,
        changedEntityId: `service:${target.service.type}:${target.index}`,
        updatedResource,
        summary: input.remove ? `${target.service.label}을 포함 서비스에서 뺐어요.` : `${formatIncludedService(nextServices[target.index])}으로 수정했어요.`,
        totalAmount: Number(updatedResource.total_amount) || 0,
      },
      verification: createVerification({ executed: true, persisted: true, resourceExists: true, details: { totalAmount: Number(updatedResource.total_amount) || 0 } }),
    };
  }

  if (name === "apply_quote_discount") {
    const resourceId = activeResource(context, "quote");
    const quote = await loadQuote(resourceId);
    const items = Array.isArray(quote.items) ? quote.items as QuoteItem[] : [];
    const subtotal = items.reduce((sum, item) => sum + (Number(item.subtotal) || 0), 0);
    const percent = input.percent == null ? undefined : parseKoreanPercent(input.percent as string | number);
    if (input.percent != null && percent === undefined) throw new Error("할인율은 0~100 사이로 알려주세요.");
    const amount = input.remove ? 0 : percent != null ? Math.round(subtotal * percent / 100) : parseKoreanMoney(input.amount as string | number);
    if (amount === undefined || amount < 0) throw new Error("할인 금액을 확인해주세요.");
    const discount = input.remove ? null : percent != null ? { type: "percent", value: percent } : { type: "amount", value: amount };
    const nextFormState = { ...quoteFormState(quote), discount, discountRate: percent || 0, extraDiscount: percent == null ? amount : 0 };
    const amounts = recalculateQuote(items, { ...quote, form_state: nextFormState }, amount);
    const updatedResource = await saveQuote(resourceId, { discount_amount: amount, form_state: nextFormState, supply_amount: amounts.supplyAmount, vat: amounts.vat, total_amount: amounts.totalAmount, deposit_amount: amounts.depositAmount, balance_amount: amounts.balanceAmount });
    return {
      tool: name, success: true,
      data: { resourceId, quoteId: resourceId, discountAmount: amount, updatedResource, summary: amount ? `${amount.toLocaleString("ko-KR")}원 할인을 적용했어요.` : "할인을 제거했어요.", totalAmount: amounts.totalAmount },
      // discountAmount는 요청 파라미터가 아니라 updatedResource.discount_amount(실제 저장값)로
      // 확인한다(스펙 §14 "LLM이 계산한 값을 verification으로 사용하지 않는다").
      verification: createVerification({ executed: true, persisted: true, resourceExists: true, details: { discountAmount: Number(updatedResource.discount_amount) || 0, totalAmount: Number(updatedResource.total_amount) } }),
    };
  }

  if (name === "update_quote_vat_mode") {
    const resourceId = activeResource(context, "quote");
    const quote = await loadQuote(resourceId);
    const mode = text(input, "mode");
    const formState = { ...((quote.form_state && typeof quote.form_state === "object") ? quote.form_state as Record<string, unknown> : {}), vatMode: mode };
    const amounts = recalculateQuote(Array.isArray(quote.items) ? quote.items as QuoteItem[] : [], { ...quote, form_state: formState });
    const updatedResource = await saveQuote(resourceId, { form_state: formState, supply_amount: amounts.supplyAmount, vat: amounts.vat, total_amount: amounts.totalAmount, deposit_amount: amounts.depositAmount, balance_amount: amounts.balanceAmount });
    return {
      tool: name, success: true,
      data: { resourceId, quoteId: resourceId, vatMode: mode, updatedResource, summary: "VAT 방식을 변경했어요.", totalAmount: amounts.totalAmount },
      verification: createVerification({ executed: true, persisted: true, resourceExists: true }),
    };
  }

  if (name === "preview_quote") {
    const resourceId = activeResource(context, "quote");
    const quote = await loadQuote(resourceId);
    return {
      tool: name,
      success: true,
      data: {
        resourceId,
        quoteId: resourceId,
        clientId: (quote.client_id as string | null) || undefined,
        workflowRunId: (quote.workflow_run_id as string | null) || undefined,
        hospitalName: (quote.hospital_name as string | null) || undefined,
        summary: "견적 미리보기를 열었어요.",
      },
      verification: createVerification({ executed: true, resourceExists: true }),
    };
  }

  if (name === "request_quote_publish") {
    const resourceId = activeResource(context, "quote");
    const quote = await loadQuote(resourceId);
    // 승인 카드 요약을 항목별로 보강한다(스펙 §19-21) — 새 카드 타입을 만들지 않고 기존
    // REQUEST_APPROVAL(approval 블록)의 summary 문자열만 여러 줄로 조립한다(결정 A). 금액은
    // 전부 이미 DB에 저장된 실제 값(quotes 테이블, computeQuoteTotals가
    // 계산해 저장한 것)이고 여기서 새로 계산하지 않는다.
    const summary = [
      `${quote.hospital_name || "현재 고객"} 견적 ${quote.quote_number || ""}`.trim(),
      "",
      ...buildQuoteBreakdownLines(quote),
      "",
      "이대로 최종 승인할까요?",
    ].join("\n");
    return {
      tool: name, success: true,
      data: { resourceId, quoteId: resourceId, approvalRequired: true, hospitalName: quote.hospital_name, totalAmount: quote.total_amount, quoteNumber: quote.quote_number, summary },
      // 승인 요청 카드일 뿐, 아직 아무것도 공개(persisted)되지 않았다.
      verification: createVerification({ executed: true, persisted: false, resourceExists: true }),
    };
  }

  if (name === "download_quote_pdf") {
    // 현재 QuoteBuilder의 편집 상태를 저장한 뒤 canonical render API에서 native PDF를 만들어야
    // 하므로 실제 다운로드는 client가 DOWNLOAD_QUOTE_PDF ui_action을 받아 사람이 누르는 버튼과
    // 같은 downloadPdf()를 호출해 처리한다. 성공 여부는 그 클라이언트 실행이 끝난 뒤에만
    // 확정되므로, 여기 success:true는 "요청을 접수했다"는 뜻이지 "PDF가 만들어졌다"는 뜻이
    // 아니다 — actionRouter.ts가 실제 결과를 채팅에 별도로 보고한다.
    const resourceId = activeResource(context, "quote");
    return {
      tool: name, success: true,
      data: { resourceId, quoteId: resourceId, summary: "PDF를 준비하고 있어요…" },
      // client-only 작업(스펙 §18) — 서버는 실제 파일 생성 여부를 알 수 없으니 persisted를
      // 단정하지 않는다.
      verification: createVerification({ executed: true }),
    };
  }

  if (name === "publish_quote") {
    const resourceId = activeResource(context, "quote");
    // 공용 publishQuote Core Command는 API Route와 Agent가 함께 사용하며
    // resolveQuoteWorkflowLink()로 고객을 자동 매칭·생성까지 전부 마친 뒤에야 성공 결과를
    // 준다 — "등록할까요?"라고 물어볼 시점이 이미 지나 있다(결정은 서버가 동기적으로 이미
    // 내렸다). 대신 발행 전/후 client_id를 비교해 "이번에 새로 연결/생성됐는지"만 판단하고,
    // 이미 벌어진 일을 정확히 보고한다("DON'T SAY IT. DO IT. THEN SAY IT" 원칙 — 아직 안
    // 일어난 일을 버튼으로 미리 묻지 않는다).
    const quoteBeforePublish = await loadQuote(resourceId);
    const hadClientBefore = Boolean(quoteBeforePublish.client_id);
    const baseUrl = resolveServerBaseUrl();
    const publishResult = await publishQuote(resourceId, {}, db);
    if (!publishResult.ok) throw new OliviaToolError(publishResult.reason, publishResult.code ?? "PUBLISH_FAILED", publishResult.details);
    const payload = publishResult.value;
    const newlyLinkedClientId = !hadClientBefore && payload.clientId ? (payload.clientId as string) : undefined;

    // 최종 승인 시 PDF를 원본 보관함(workflow_artifacts)에 아카이브한다(스펙 M5). 공개 후
    // 아카이브가 실패하면 PARTIAL_SUCCESS로 반환해 전체 성공으로 숨기지 않는다.
    let pdfArchived = false;
    let workflowArtifactId: string | undefined;
    let pdfArchiveError: string | undefined;
    try {
      const { buffer } = await renderQuoteBuffer(quoteBeforePublish, "pdf", { baseUrl });
      const quoteNumber = String(quoteBeforePublish.quote_number || resourceId);
      const fileName = `${quoteNumber}.pdf`;
      const artifact = await archiveWorkflowPdf({
        buffer, fileName, documentType: "quote", sourceTable: "quotes", sourceId: resourceId,
        title: `${quoteBeforePublish.hospital_name || "견적서"} 견적서`,
        clientId: payload.clientId, workflowRunId: payload.workflowRunId,
      }, db);
      if (!artifact.id) throw new Error("PDF 원본 저장 결과에서 ID를 확인하지 못했습니다.");
      pdfArchived = true;
      workflowArtifactId = String(artifact.id);
    } catch (archiveError) {
      pdfArchiveError = archiveError instanceof Error ? archiveError.message : "PDF 원본 보관 실패";
      console.error("[publish_quote] PDF 아카이브 실패", pdfArchiveError);
    }
    // publish_quote는 QUOTE_MUTATION_TOOLS(lib/olivia/output/quoteConfirmations.ts)에 있어서
    // 이 summary가 모델 자유 텍스트 대신 그대로 채팅에 나간다 — 신규 고객 등록 여부를 여기서
    // 바로 알려주면 별도 승인 카드 없이도 스펙 §31이 요구하는 "발행 직후 정확히 한 번" 안내를
    // 만족한다. 완료 문구도 "완료됐습니다"로 뭉뚱그리지 않고 실제 구성을 반영한다(스펙 §22).
    const summary = [
      `${quoteBeforePublish.hospital_name || "현재 고객"} 견적서가 완성되었습니다.`,
      "",
      ...buildQuoteBreakdownLines(quoteBeforePublish),
      newlyLinkedClientId ? `\n${quoteBeforePublish.hospital_name || "해당 병원"}을 신규 고객으로 등록했어요.` : null,
      !pdfArchived ? "\n⚠️ PDF 원본 보관에 실패했어요." : null,
    ].filter((line): line is string => line !== null).join("\n");
    const data = {
      resourceId,
      quoteId: resourceId,
      ...payload,
      hospitalName: quoteBeforePublish.hospital_name,
      newlyLinkedClientId,
      pdfArchived,
      workflowArtifactId,
      summary,
    };
    if (!pdfArchived) {
      return {
        tool: name,
        success: false,
        code: "PARTIAL_SUCCESS",
        error: `견적서 공개는 저장됐지만 PDF 원본 보관에 실패했어요.${pdfArchiveError ? ` ${pdfArchiveError}` : ""}`,
        data,
        verification: createVerification({ executed: true, persisted: false, resourceExists: true, linked: Boolean(payload.clientId || hadClientBefore), details: { publicationPersisted: true, pdfArchived: false } }),
      };
    }
    return {
      tool: name,
      success: true,
      data,
      verification: createVerification({
        executed: true,
        persisted: true,
        resourceExists: true,
        linked: Boolean(payload.clientId || hadClientBefore),
        details: { newlyLinkedClient: Boolean(newlyLinkedClientId), pdfArchived, workflowArtifactId: workflowArtifactId ?? null },
      }),
    };
  }

  if (name === "resolve_quote_client") {
    const resourceId = text(input, "quoteId") || activeResource(context, "quote");
    const quote = await loadQuote(resourceId);
    const match = await resolveQuoteClient(db, quote);
    return {
      tool: name, success: true, data: match,
      verification: createVerification({ executed: true, resourceExists: match.status !== "no_match" }),
    };
  }

  if (name === "link_new_client_to_quote") {
    const resourceId = text(input, "resourceId") || activeResource(context, "quote");
    const clientId = text(input, "clientId") || null;
    const { updated, client, workflowRunId } = await linkNewClientToQuote(db, {
      resourceId,
      clientId,
      hospitalName: text(input, "hospitalName") || null,
      contactName: text(input, "contactName") || null,
      phone: text(input, "phone") || null,
      email: text(input, "email") || null,
    });
    return {
      tool: name,
      success: true,
      data: {
        resourceId,
        clientId: client.id,
        workflowRunId,
        hospitalName: client.hospital_name,
        updatedResource: updated,
        summary: `${client.hospital_name}에 이 견적서를 연결했어요.`,
      },
      // linkNewClientToQuote는 실패 시 throw하므로, 여기 도달했다는 것 자체가 실제 연결
      // 확인이다(스펙 §16) — updated.client_id로 다시 한번 실제 저장값을 확인한다.
      verification: createVerification({ executed: true, persisted: true, resourceExists: true, linked: Boolean(updated.client_id) }),
    };
  }

  throw new Error("지원하지 않는 Olivia 작업이에요.");
}
