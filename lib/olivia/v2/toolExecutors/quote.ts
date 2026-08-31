import { getSupabaseAdmin } from "@/lib/supabase";
import { executeOliviaCrud } from "@/lib/olivia/crud/executor";
import { buildAgentQuoteData } from "@/lib/quote/agentQuote";
import { parseKoreanCount, parseKoreanMoney, resolveOrdinalReference } from "@/lib/olivia/naturalLanguageNumbers";
import { addQuoteItem, quoteItems, recalculateQuote, removeQuoteItem, resolveQuoteItem, updateQuoteItem, type QuoteItem } from "@/lib/quote/quoteMutationService";
import { linkNewClientToQuote, resolveQuoteClient } from "@/lib/olivia/tools/quoteClientLink";
import { fuzzyNameSearch } from "@/lib/olivia/nameSearch";
import { createClientWithWorkflow } from "@/lib/clients/createClientWithWorkflow";
import { listActiveMemories, recordMemoryOutcome } from "@/lib/olivia/memory/repository";
import { resolveExecutionPolicy } from "@/lib/olivia/memory/executionPolicy";
import type { OliviaContextSnapshot, OliviaToolResult } from "@/lib/olivia/v2/types";
import { text, activeResource } from "./common";
import { createVerification } from "./verification";

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
  const selected = context.selectedEntityType === "quote-item" ? context.selectedEntityId : undefined;
  const rawPosition = input.position;
  const position = rawPosition == null ? undefined : resolveOrdinalReference(String(rawPosition), quoteItems(quote.items).length);
  const matches = resolveQuoteItem(quote.items, text(input, "selector"), selected, position);
  if (matches.length !== 1) {
    const choices = matches.map(({ item }) => item.name).join(", ");
    throw new Error(choices ? `대상 항목이 여러 개예요: ${choices}` : "수정할 견적 항목을 찾지 못했어요.");
  }
  return matches[0];
}

export const QUOTE_TOOL_NAMES = [
  "create_quote", "start_quote_wizard", "update_quote_item", "add_quote_item", "remove_quote_item",
  "update_quote_note", "update_quote_info", "apply_quote_discount", "update_quote_vat_mode",
  "rebalance_quote_total", "apply_quote_rebalance", "preview_quote", "request_quote_publish",
  "download_quote_pdf", "publish_quote", "resolve_quote_client", "link_new_client_to_quote",
] as const;

export async function executeQuoteTool(
  name: string,
  input: Record<string, unknown>,
  context: OliviaContextSnapshot,
): Promise<OliviaToolResult> {
  const db = getSupabaseAdmin();

  if (name === "start_quote_wizard") {
    // 서버 작업 없음 — flowId만 발급하면 클라이언트가 그 값으로 채팅 카드/스토어를 초기화한다
    // (start_select_match_flow와 동일한 패턴, 견적서 UX 개편 2026-08-31).
    return { tool: name, success: true, data: { flowId: crypto.randomUUID() }, verification: createVerification({ executed: true }) };
  }

  if (name === "create_quote") {
    const hospitalName = text(input, "hospitalName") || context.activeClientName;
    if (!hospitalName) throw new Error("견적을 만들 고객을 먼저 알려주세요.");

    // Adaptive Memory Execution Policy — "앞으로 견적 요청에 고객이 없으면 자동등록해" 같은
    // 사용자가 가르친 규칙이 활성화돼 있으면, 고객/프로젝트가 없어도 등록해달라고 되묻지 않고
    // 여기서 직접 찾거나 만든다. 규칙이 없으면(마이그레이션 미적용 포함) 정책 값이 전부 falsy라
    // 아래 분기가 전혀 실행되지 않고 기존 동작 그대로다.
    const quoteMemories = await listActiveMemories(db, { scopes: ["quote"] });
    const policy = resolveExecutionPolicy(quoteMemories);
    let clientId = context.activeClientId;
    let workflowRunId = context.activeProjectId;
    let clientCreated = false;
    if (!clientId && (policy.autoCreateClient || policy.autoCreateProject)) {
      const candidates = await fuzzyNameSearch<{ id: string; hospital_name: string }>({
        db, table: "clients", nameColumn: "hospital_name", select: "id,hospital_name", query: hospitalName, limit: 5,
      });
      if (candidates.length > 1) {
        return {
          tool: name,
          success: false,
          error: `"${hospitalName}"와 비슷한 고객이 ${candidates.length}명 있어요(${candidates.map((c) => c.hospital_name).join(", ")}). 어느 고객인지 확인해주세요.`,
        };
      }
      if (policy.autoCreateClient || candidates.length === 1) {
        const created = await createClientWithWorkflow(db, {
          hospitalName: candidates[0]?.hospital_name || hospitalName,
          contactName: text(input, "contactName") || null,
          phone: text(input, "phone") || null,
          email: text(input, "email") || null,
        });
        clientId = created.client.id;
        workflowRunId = created.run?.id;
        clientCreated = candidates.length === 0;
      }
    }

    const quoteData = buildAgentQuoteData({ ...input, hospitalName }, workflowRunId);
    if (clientId) (quoteData as Record<string, unknown>).clientId = clientId;
    let execution;
    try {
      execution = await executeOliviaCrud(db, {
        operation: "create",
        domain: "quote",
        data: quoteData,
        requestText: `${hospitalName} 견적 생성`,
      });
    } catch (error) {
      const usedMemory = quoteMemories.find((memory) => memory.key === "quote_auto_client_project_creation");
      if (usedMemory) await recordMemoryOutcome(db, usedMemory.id, { success: false });
      throw error;
    }
    const usedMemory = quoteMemories.find((memory) => memory.key === "quote_auto_client_project_creation");
    if (usedMemory) await recordMemoryOutcome(db, usedMemory.id, { success: true });
    const record = execution.record || {};
    // executeOliviaCrud의 create는 insert().select().single()로 실제 저장된 row를 돌려받는다 —
    // execution.recordId가 있다는 것 자체가 이미 실제 DB round-trip으로 확인된 결과다(스펙 §13).
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
      verification: createVerification({
        executed: true,
        persisted: Boolean(execution.recordId),
        resourceExists: Boolean(execution.recordId),
        linked: Boolean(record.client_id),
        details: { clientCreated },
      }),
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
    const amounts = recalculateQuote(mutation.items, quote);
    const updatedResource = await saveQuote(resourceId, { items: mutation.items, form_state: { ...((quote.form_state && typeof quote.form_state === "object") ? quote.form_state as Record<string, unknown> : {}), agentOverrideItems: true }, supply_amount: amounts.supplyAmount, vat: amounts.vat, total_amount: amounts.totalAmount, deposit_amount: amounts.depositAmount, balance_amount: amounts.balanceAmount });
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
    const amounts = recalculateQuote(mutation.items, quote);
    const updatedResource = await saveQuote(resourceId, { items: mutation.items, form_state: { ...((quote.form_state && typeof quote.form_state === "object") ? quote.form_state as Record<string, unknown> : {}), agentOverrideItems: true }, supply_amount: amounts.supplyAmount, vat: amounts.vat, total_amount: amounts.totalAmount, deposit_amount: amounts.depositAmount, balance_amount: amounts.balanceAmount });
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

  if (name === "apply_quote_discount") {
    const resourceId = activeResource(context, "quote");
    const quote = await loadQuote(resourceId);
    const items = Array.isArray(quote.items) ? quote.items as QuoteItem[] : [];
    const subtotal = items.reduce((sum, item) => sum + (Number(item.subtotal) || 0), 0);
    const amount = input.remove ? 0 : input.percent != null ? Math.round(subtotal * Number(input.percent) / 100) : parseKoreanMoney(input.amount as string | number);
    if (amount === undefined || amount < 0) throw new Error("할인 금액을 확인해주세요.");
    const amounts = recalculateQuote(items, quote, amount);
    const updatedResource = await saveQuote(resourceId, { discount_amount: amount, form_state: { ...((quote.form_state && typeof quote.form_state === "object") ? quote.form_state as Record<string, unknown> : {}), extraDiscount: amount }, supply_amount: amounts.supplyAmount, vat: amounts.vat, total_amount: amounts.totalAmount, deposit_amount: amounts.depositAmount, balance_amount: amounts.balanceAmount });
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
    return {
      tool: name, success: true,
      data: { resourceId, quoteId: resourceId, currentTotal, targetTotal, projectedTotal: projected.totalAmount, proposedDiscountAmount: discountAmount, approvalRequired: true, summary: `현재 ${currentTotal.toLocaleString("ko-KR")}원에서 ${discountAmount.toLocaleString("ko-KR")}원 할인을 적용하면 총액은 ${projected.totalAmount.toLocaleString("ko-KR")}원입니다. 적용할까요?` },
      // 계산만 하고 승인 카드를 띄우는 단계다 — 아직 아무것도 저장되지 않았다.
      verification: createVerification({ executed: true, persisted: false }),
    };
  }

  if (name === "apply_quote_rebalance") {
    return executeQuoteTool("apply_quote_discount", { amount: input.discountAmount, percent: null, remove: false }, context);
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
    // 전부 이미 DB에 저장된 실제 값(quotes 테이블, computeQuoteTotals/calculateQuoteAmounts가
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
    // PDF는 브라우저에 열려 있는 QuoteBuilder의 html2canvas/jsPDF로만 만들 수 있어 서버는
    // DB를 건드리지 않는다 — 여기서는 "지금 견적서 화면이 실제로 열려 있는지"만 activeResource로
    // 검증하고, 실제 다운로드는 client가 DOWNLOAD_QUOTE_PDF ui_action을 받아 사람이 누르는
    // 버튼과 완전히 같은 downloadPdf() 함수를 호출해 처리한다. 성공 여부는 그 클라이언트
    // 실행이 끝난 뒤에만 확정되므로, 여기 success:true는 "요청을 접수했다"는 뜻이지 "PDF가
    // 만들어졌다"는 뜻이 아니다 — actionRouter.ts가 실제 결과를 채팅에 별도로 보고한다.
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
    // 공개(POST .../publish)는 app/api/quotes/[id]/publish/route.ts 안에서
    // resolveQuoteWorkflowLink()로 고객을 자동 매칭·생성까지 전부 마친 뒤에야 성공 응답을
    // 준다 — "등록할까요?"라고 물어볼 시점이 이미 지나 있다(결정은 서버가 동기적으로 이미
    // 내렸다). 대신 발행 전/후 client_id를 비교해 "이번에 새로 연결/생성됐는지"만 판단하고,
    // 이미 벌어진 일을 정확히 보고한다("DON'T SAY IT. DO IT. THEN SAY IT" 원칙 — 아직 안
    // 일어난 일을 버튼으로 미리 묻지 않는다).
    const quoteBeforePublish = await loadQuote(resourceId);
    const hadClientBefore = Boolean(quoteBeforePublish.client_id);
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://127.0.0.1:3000";
    const response = await fetch(`${baseUrl}/api/quotes/${resourceId}/publish`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    const payload = await response.json();
    if (!response.ok || !payload.ok) throw new Error(payload.error || "견적서를 공개하지 못했어요.");
    const newlyLinkedClientId = !hadClientBefore && payload.clientId ? (payload.clientId as string) : undefined;
    // publish_quote는 QUOTE_MUTATION_TOOLS(lib/olivia/output/quoteConfirmations.ts)에 있어서
    // 이 summary가 모델 자유 텍스트 대신 그대로 채팅에 나간다 — 신규 고객 등록 여부를 여기서
    // 바로 알려주면 별도 승인 카드 없이도 스펙 §31이 요구하는 "발행 직후 정확히 한 번" 안내를
    // 만족한다. 완료 문구도 "완료됐습니다"로 뭉뚱그리지 않고 실제 구성을 반영한다(스펙 §22).
    const summary = [
      `${quoteBeforePublish.hospital_name || "현재 고객"} 견적서가 완성되었습니다.`,
      "",
      ...buildQuoteBreakdownLines(quoteBeforePublish),
      newlyLinkedClientId ? `\n${quoteBeforePublish.hospital_name || "해당 병원"}을 신규 고객으로 등록했어요.` : null,
    ].filter((line): line is string => line !== null).join("\n");
    return {
      tool: name,
      success: true,
      data: {
        resourceId,
        quoteId: resourceId,
        ...payload,
        hospitalName: quoteBeforePublish.hospital_name,
        newlyLinkedClientId,
        summary,
      },
      verification: createVerification({
        executed: true,
        persisted: true,
        resourceExists: true,
        linked: Boolean(payload.clientId || hadClientBefore),
        details: { newlyLinkedClient: Boolean(newlyLinkedClientId) },
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
    const { updated, client } = await linkNewClientToQuote(db, {
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
      data: { resourceId, updatedResource: updated, summary: `${client.hospital_name}에 이 견적서를 연결했어요.` },
      // linkNewClientToQuote는 실패 시 throw하므로, 여기 도달했다는 것 자체가 실제 연결
      // 확인이다(스펙 §16) — updated.client_id로 다시 한번 실제 저장값을 확인한다.
      verification: createVerification({ executed: true, persisted: true, resourceExists: true, linked: Boolean(updated.client_id) }),
    };
  }

  throw new Error("지원하지 않는 Olivia 작업이에요.");
}
