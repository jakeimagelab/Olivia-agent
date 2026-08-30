import type { FunctionTool } from "openai/resources/responses/responses";
import { getSupabaseAdmin } from "@/lib/supabase";
import { executeOliviaCrud } from "@/lib/olivia/crud/executor";
import { validateOliviaCrudRequest } from "@/lib/olivia/crud/validation";
import { getOliviaCrudCapabilities } from "@/lib/olivia/crud/registry";
import type { OliviaCrudDomain, OliviaCrudRequest, OliviaCrudTarget } from "@/lib/olivia/crud/types";
import { isUuid } from "@/lib/assistant/validation";
import { resolveUiActions } from "@/lib/olivia/agent/uiActionResolvers";
import { buildAgentQuoteData } from "@/lib/quote/agentQuote";
import { parseKoreanCount, parseKoreanMoney, parseShotPosition, resolveOrdinalReference } from "@/lib/olivia/naturalLanguageNumbers";
import { addQuoteItem, quoteItems, recalculateQuote, removeQuoteItem, resolveQuoteItem, updateQuoteItem, type QuoteItem } from "@/lib/quote/quoteMutationService";
import { computeContractDeposit } from "@/lib/contract/computeContractDeposit";
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
import {
  advanceWorkflowStep,
  approveWorkflowTask,
  completeWorkflowRetroactively,
  getWorkflowStatus,
  listWorkflowStepTasks,
  processWorkflowStep,
} from "@/lib/olivia/tools/workflow";
import { listMailingQueue, sendMailing } from "@/lib/olivia/tools/mailing";
import { getContiStatus } from "@/lib/olivia/tools/conti";
import { createGallery, getGallery } from "@/lib/olivia/tools/gallery";
import { linkDocumentToClient } from "@/lib/olivia/tools/documentLink";
import { continueTaskSession, getTaskSessionStatus, pauseTaskSession, startTaskSession } from "@/lib/olivia/tools/taskSession";
import { findCalendarConflicts } from "@/lib/assistant/actions/calendarAvailability";
import {
  createAssistantEmailDraft,
  readAssistantEmail,
  searchAssistantEmail,
  summarizeAssistantEmail,
} from "@/lib/assistant/actions/email";
import { ensurePrimaryAssistantOwner } from "@/lib/assistant/owners/service";
import { executeOliviaChatWorkTool, OLIVIA_CHAT_WORK_TOOL_NAMES } from "@/lib/olivia/chatWorkTools";
import { fuzzyNameSearch, fuzzyNameSearchOne } from "@/lib/olivia/nameSearch";
import { analyzeChannels } from "@/lib/channelAnalysis";
import { resolveFeatureIntent } from "@/lib/olivia/features/resolver";
import { normalizeToolError, OLIVIA_FALLBACK_MESSAGES } from "@/lib/olivia/output/errorMessages";
import { searchDocuments } from "@/lib/olivia/documents/searchDocuments";
import { DOCUMENT_TYPE_LABELS, normalizeDocumentTypeHint, type OliviaDocumentRef } from "@/lib/olivia/documents/types";
import { createClientWithWorkflow } from "@/lib/clients/createClientWithWorkflow";
import { OLIVIA_MEMORY_TYPES, type OliviaMemoryType } from "@/lib/olivia/memory/types";
import { createMemory, deactivateMemory, findMemoryByKeyScope, listActiveMemories, recordMemoryOutcome, updateMemory } from "@/lib/olivia/memory/repository";
import { resolveExecutionPolicy } from "@/lib/olivia/memory/executionPolicy";
import { formatMemoryForUser } from "@/lib/olivia/memory/format";

// calendar.ts/workflow.ts/mailing.ts/gallery.ts, chatWorkTools.ts는 전부 레거시(Claude) 경로와
// 공유하는 {action:"done", message, ...} 모양으로 결과를 돌려준다 — v2가 기대하는
// {tool, success, data} 모양으로 한 곳에서만 변환한다.
function fromLegacyResult(name: string, result: { action?: string; message: string; [key: string]: unknown }): OliviaToolResult {
  const { message, action, ...rest } = result;
  return { tool: name, success: true, data: { message, ...rest } };
}

// 코드 요청서(2026-08-15) 3번 항목 — CRUD 엔진(lib/olivia/crud)은 12개 도메인을 지원하지만
// 챗 도구로는 quote/contract/conti 3개만 노출돼 있었다. client/workflow는 위험도가 높아
// (고객 원장 정보 직접 변경, 단계 강제 이동) 4번 항목(승인 게이트)이 실제로 막는 걸 확인한 뒤
// 2차로 열기로 하고, 1차는 나머지 7개 도메인만 연다.
const OPEN_FEATURE_RECORD_DOMAINS: readonly OliviaCrudDomain[] = [
  "memo", "calendar", "photo_gallery", "select_gallery", "review", "mail_draft", "agent_task",
];

// 새 도메인이 OLIVIA_CRUD_REGISTRY에 추가돼도 이 설명을 손으로 안 고치도록 registry에서 자동 생성한다.
function buildFeatureRecordDescription(verb: "생성" | "수정") {
  const lines = getOliviaCrudCapabilities()
    .filter((cap) => OPEN_FEATURE_RECORD_DOMAINS.includes(cap.domain))
    .map((cap) => `${cap.domain}(${cap.label}): ${cap.fields.join(", ")}`);
  return `[WRITE] 메모/일정/사진갤러리/셀렉갤러리/후기/메일초안/올리비아업무 데이터를 실제 DB에 ${verb}합니다. `
    + `domain은 다음 중 하나, data는 해당 도메인 필드를 담은 JSON 객체 문자열입니다:\n${lines.join("\n")}`;
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
    description: "고객의 실제 견적 초안을 DB에 생성합니다. 생성 성공 결과의 quoteId로만 화면을 엽니다. 브랜드가 대화에서 아직 확인되지 않았거나 요청이 막연하면(예: \"견적서 만들자\") 이 도구 대신 start_quote_wizard를 먼저 써서 브랜드를 물어본다 — 브랜드와 병원명 등 충분한 정보가 이미 한 메시지에 있으면 곧장 이 도구를 쓴다.",
    strict: true,
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        brand: { type: ["string", "null"], enum: ["photoclinic", "jakeimage", null], description: "포토클리닉 또는 제이크이미지연구소. 대화에서 확인됐으면 채우고, 모르면 null(이 경우 photoclinic 기본값으로 생성되므로 가능하면 먼저 확인한다)." },
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
      required: ["brand", "hospitalName", "packageId", "contactName", "phone", "email", "shootDate", "profileCount", "stagedCount", "memo"],
    },
  },
  {
    type: "function",
    name: "create_contract",
    description: "현재 고객/프로젝트의 최신 견적(또는 quoteId로 지정한 견적, 또는 지금 열려 있는 견적 Workspace)을 확인한 뒤 실제 계약서 초안을 DB에 생성합니다. \"이 견적으로 계약서 만들어줘\"처럼 지금 보고 있는 견적을 가리키는 요청이면 quoteId를 비워도 지금 열린 견적을 우선 사용합니다.",
    strict: true,
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: { hospitalName: { type: ["string", "null"] }, quoteId: { type: ["string", "null"], description: "특정 견적을 명시적으로 지정할 때만 채웁니다." } },
      required: ["hospitalName", "quoteId"],
    },
  },
  { type: "function", name: "update_contract_terms", description: "현재 계약서의 계약금 비율, 잔금 지급조건, 납품조건, 특약사항처럼 항목·금액이 아닌 계약 전용 조건을 실제 DB에 수정합니다. 언급된 값만 채우고 나머지는 null로 둡니다. depositRate가 바뀌면 계약금/잔금 금액은 자동으로 다시 계산됩니다(직접 금액을 계산하지 않습니다).", strict: true, parameters: { type: "object", additionalProperties: false, properties: { depositRate: { type: ["number", "null"], description: "계약금 비율(%). 예: 30, 50" }, paymentTerms: { type: ["string", "null"], description: "잔금 지급 시점 짧은 표현. 예: '촬영 전날', '촬영 당일', '납품 전'" }, deliveryTerms: { type: ["string", "null"], description: "납품 기한 짧은 표현. 예: '14일', '2주'" }, specialTerms: { type: ["string", "null"], description: "특약사항 전체 문단. 기존 내용에 추가/제거할 때도 최종 전체 내용을 다시 작성합니다." } }, required: ["depositRate", "paymentTerms", "deliveryTerms", "specialTerms"] } },
  { type: "function", name: "request_contract_signature", description: "현재 계약서에 대표 서명이 필요할 때 채팅에 서명 패드를 띄웁니다. DB를 바로 바꾸지 않습니다.", strict: true, parameters: { type: "object", additionalProperties: false, properties: {}, required: [] } },
  { type: "function", name: "request_contract_publish", description: "현재 계약서 최종 생성(공개) 승인을 요청합니다. 확인 전에는 생성하지 않습니다.", strict: true, parameters: { type: "object", additionalProperties: false, properties: {}, required: [] } },
  { type: "function", name: "download_contract_pdf", description: "현재 화면에 열려 있는 계약서를 PDF로 저장하고 다운로드합니다. 계약서 화면이 열려 있지 않으면 실행할 수 없습니다.", strict: true, parameters: { type: "object", additionalProperties: false, properties: {}, required: [] } },
  {
    type: "function",
    name: "get_conti_status",
    description: "[READ] 병원명으로 저장된 콘티가 있는지 conti_saves에서 실제로 조회합니다. '콘티 찾아줘'/'콘티 있어?'/'콘티 저장됐어?' 같은 요청에는 반드시 이 도구를 먼저 쓴다 — 도구 없이 있다/없다를 추측하지 않는다.",
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
    name: "create_conti",
    description: "현재 고객의 실제 촬영 콘티 초안을 DB에 생성합니다. 이미 저장된 콘티가 있는지 먼저 확인하고 싶으면 get_conti_status를 쓴다.",
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
        position: { type: ["string", "null"], description: "'두 번째', '마지막' 등 순서 표현을 사용자가 말한 그대로. 인덱스로 직접 계산하지 않는다." },
        amount: { type: ["number", "string", "null"], description: "50, 50만원, 오십만원 등" },
        quantity: { type: ["number", "string", "null"] },
        description: { type: ["string", "null"] },
        note: { type: ["string", "null"] },
      },
      required: ["selector", "position", "amount", "quantity", "description", "note"],
    },
  },
  { type: "function", name: "add_quote_item", description: "현재 견적서에 항목을 추가합니다. 기존 단가 근거가 없으면 unitPrice를 null로 두어 확인을 요청합니다.", strict: true, parameters: { type: "object", additionalProperties: false, properties: { name: { type: "string" }, unitPrice: { type: ["number", "string", "null"] }, quantity: { type: ["number", "string", "null"] }, description: { type: ["string", "null"] }, note: { type: ["string", "null"] } }, required: ["name", "unitPrice", "quantity", "description", "note"] } },
  { type: "function", name: "remove_quote_item", description: "현재 견적서에서 선택되거나 이름이 정확히 하나로 식별되는 일반 항목을 삭제합니다.", strict: true, parameters: { type: "object", additionalProperties: false, properties: { selector: { type: ["string", "null"] }, position: { type: ["string", "null"], description: "'두 번째', '마지막' 등 순서 표현을 사용자가 말한 그대로." } }, required: ["selector", "position"] } },
  { type: "function", name: "update_quote_note", description: "현재 견적서의 전체 메모를 수정합니다.", strict: true, parameters: { type: "object", additionalProperties: false, properties: { note: { type: "string" } }, required: ["note"] } },
  { type: "function", name: "update_quote_info", description: "현재 견적서의 병원명/담당자/연락처/이메일/견적일/촬영일/유효기한/제목처럼 항목·금액이 아닌 기본 정보를 실제 DB에 수정합니다. 언급된 값만 채우고 나머지는 null로 둡니다.", strict: true, parameters: { type: "object", additionalProperties: false, properties: { hospitalName: { type: ["string", "null"] }, contactName: { type: ["string", "null"] }, phone: { type: ["string", "null"] }, email: { type: ["string", "null"] }, quoteDate: { type: ["string", "null"] }, shootDate: { type: ["string", "null"] }, validUntil: { type: ["string", "null"] }, quoteTitle: { type: ["string", "null"] } }, required: ["hospitalName", "contactName", "phone", "email", "quoteDate", "shootDate", "validUntil", "quoteTitle"] } },
  { type: "function", name: "apply_quote_discount", description: "현재 견적서에 원 단위 또는 퍼센트 할인을 적용하거나 제거합니다.", strict: true, parameters: { type: "object", additionalProperties: false, properties: { amount: { type: ["number", "string", "null"] }, percent: { type: ["number", "null"] }, remove: { type: "boolean" } }, required: ["amount", "percent", "remove"] } },
  { type: "function", name: "update_quote_vat_mode", description: "현재 견적서의 VAT 표시/계산 모드를 기존 견적 데이터에 반영합니다.", strict: true, parameters: { type: "object", additionalProperties: false, properties: { mode: { type: "string", enum: ["separate", "included", "excluded"] } }, required: ["mode"] } },
  { type: "function", name: "rebalance_quote_total", description: "목표 총액에 맞춘 조정안을 계산합니다. 즉시 수정하지 않고 반드시 승인 요청만 생성합니다.", strict: true, parameters: { type: "object", additionalProperties: false, properties: { targetTotal: { type: ["number", "string"] } }, required: ["targetTotal"] } },
  { type: "function", name: "preview_quote", description: "현재 견적서 미리보기를 엽니다. DB 변경은 없습니다.", strict: true, parameters: { type: "object", additionalProperties: false, properties: {}, required: [] } },
  { type: "function", name: "request_quote_publish", description: "현재 견적서 공개 승인을 요청합니다. 확인 전에는 공개하지 않습니다.", strict: true, parameters: { type: "object", additionalProperties: false, properties: {}, required: [] } },
  { type: "function", name: "download_quote_pdf", description: "현재 화면에 열려 있는 견적서를 PDF로 저장하고 다운로드합니다. 견적서 화면이 열려 있지 않으면 실행할 수 없습니다.", strict: true, parameters: { type: "object", additionalProperties: false, properties: {}, required: [] } },
  { type: "function", name: "add_conti_shots", description: "현재 콘티에 컷을 1개 이상 추가합니다. 여러 항목(예: 인물 목록)을 한 번에 추가할 때는 각 항목을 items 배열의 별도 원소로 넣는다 — 절대 하나의 description에 전체 내용을 합쳐서 넣지 않는다. 각 항목의 성격이 달라도(예: 팀/역할/위치가 다른 6명) 각자 다른 필드값으로 넣는다. 원본 자료에 없는 정보(예: 호실 번호로 층수를 추측)는 필드에 채우지 않는다.", strict: true, parameters: { type: "object", additionalProperties: false, properties: { items: { type: "array", items: { type: "object", additionalProperties: false, properties: { category: { type: "string" }, keyword: { type: ["string", "null"] }, personnel: { type: ["string", "null"] }, location: { type: ["string", "null"] }, description: { type: ["string", "null"] }, notes: { type: ["string", "null"] } }, required: ["category", "keyword", "personnel", "location", "description", "notes"] } }, insertAfter: { type: ["number", "string", "null"] } }, required: ["items", "insertAfter"] } },
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
  // ── 캘린더 (READ/WRITE, 실제 DB — trash로 되돌릴 수 있어 승인 없이 실행) ──
  { type: "function", name: "calendar_list", description: "[READ] 특정 날짜의 실제 일정 목록을 조회합니다.", strict: true, parameters: { type: "object", additionalProperties: false, properties: { date: { type: "string", description: "YYYY-MM-DD" } }, required: ["date"] } },
  { type: "function", name: "calendar_add", description: "[WRITE] 새 일정을 실제 캘린더에 추가합니다. 삭제(trash)로 되돌릴 수 있습니다.", strict: true, parameters: { type: "object", additionalProperties: false, properties: { date: { type: "string" }, title: { type: "string" }, time: { type: ["string", "null"] }, location: { type: ["string", "null"] }, memo: { type: ["string", "null"] }, category: { type: ["string", "null"] } }, required: ["date", "title", "time", "location", "memo", "category"] } },
  { type: "function", name: "calendar_add_bulk", description: "[WRITE] 여러 일정을 한 번에 실제 캘린더에 추가합니다.", strict: true, parameters: { type: "object", additionalProperties: false, properties: { tasks: { type: "array", items: { type: "object", additionalProperties: false, properties: { date: { type: "string" }, title: { type: "string" }, time: { type: ["string", "null"] }, location: { type: ["string", "null"] } }, required: ["date", "title", "time", "location"] } } }, required: ["tasks"] } },
  { type: "function", name: "calendar_update", description: "[WRITE] 기존 일정을 id 또는 date+matchTitle로 찾아 실제로 수정합니다.", strict: true, parameters: { type: "object", additionalProperties: false, properties: { id: { type: ["string", "null"] }, date: { type: ["string", "null"] }, matchTitle: { type: ["string", "null"] }, title: { type: ["string", "null"] }, time: { type: ["string", "null"] }, location: { type: ["string", "null"] }, memo: { type: ["string", "null"] }, category: { type: ["string", "null"], enum: ["shooting", "client", "admin", "personal", "general", null], description: "촬영=shooting, 고객=client, 행정=admin, 개인=personal, 기타=general. app/calendar/page.tsx의 CATS 색상 범례와 같은 5개 값 — 그 이름을 언급하면 바로 이 값으로 채운다." } }, required: ["id", "date", "matchTitle", "title", "time", "location", "memo", "category"] } },
  { type: "function", name: "calendar_complete", description: "[WRITE] 일정을 완료 처리합니다.", strict: true, parameters: { type: "object", additionalProperties: false, properties: { id: { type: ["string", "null"] }, date: { type: ["string", "null"] }, matchTitle: { type: ["string", "null"] } }, required: ["id", "date", "matchTitle"] } },
  { type: "function", name: "calendar_delete", description: "[WRITE] 일정을 삭제합니다(휴지통 30일 보관, 복원 가능).", strict: true, parameters: { type: "object", additionalProperties: false, properties: { id: { type: ["string", "null"] }, date: { type: ["string", "null"] }, matchTitle: { type: ["string", "null"] } }, required: ["id", "date", "matchTitle"] } },
  { type: "function", name: "calendar_availability", description: "[READ] 특정 날짜의 일정 충돌 여부를 확인합니다. DB 변경 없음.", strict: true, parameters: { type: "object", additionalProperties: false, properties: { date: { type: "string" }, time: { type: ["string", "null"] } }, required: ["date", "time"] } },
  { type: "function", name: "calendar_list_month", description: "[READ] 특정 월(또는 이번주처럼 여러 날) 전체 일정을 한 번에 조회합니다. 하루씩 여러 번 부르지 않고 이 도구를 씁니다.", strict: true, parameters: { type: "object", additionalProperties: false, properties: { month: { type: "string", description: "YYYY-MM" } }, required: ["month"] } },
  // ── 워크플로우 ──
  { type: "function", name: "get_workflow_status", description: "[READ] 고객의 현재 워크플로우 단계를 조회합니다.", strict: true, parameters: { type: "object", additionalProperties: false, properties: { clientName: { type: "string" } }, required: ["clientName"] } },
  { type: "function", name: "list_active_workflows", description: "[READ] 지금 진행 중인 프로젝트(워크플로우) 전체 목록을 조회합니다. 특정 고객명이 없을 때 이 도구를 씁니다.", strict: true, parameters: { type: "object", additionalProperties: false, properties: {}, required: [] } },
  { type: "function", name: "advance_workflow_step", description: "[WRITE] 고객의 워크플로우를 지정한 단계로 이동합니다. 견적/계약/콘티 단계에 실제 문서가 없으면 건너뛰지 않고 안내만 합니다.", strict: true, parameters: { type: "object", additionalProperties: false, properties: { clientName: { type: "string" }, toStepKey: { type: "string" } }, required: ["clientName", "toStepKey"] } },
  { type: "function", name: "complete_workflow_retroactively", description: "[WRITE] 고객의 워크플로우 전체를 소급 완료 처리합니다(이미 끝난 실제 업무를 뒤늦게 기록할 때).", strict: true, parameters: { type: "object", additionalProperties: false, properties: { clientName: { type: "string" }, reason: { type: ["string", "null"] } }, required: ["clientName", "reason"] } },
  { type: "function", name: "list_workflow_step_tasks", description: "[READ] 고객의 현재 워크플로우 단계에 있는 '업무 프로세스' 체크리스트(할 일 목록과 상태)를 조회합니다.", strict: true, parameters: { type: "object", additionalProperties: false, properties: { clientName: { type: "string" } }, required: ["clientName"] } },
  { type: "function", name: "process_workflow_step", description: "[WRITE] '올리비아가 현재 단계 처리하기' 버튼과 동일합니다 — 고객의 현재 단계에 대기 중인 업무를 전부 처리합니다. 견적서/계약서/콘티 단계에서는 실제 문서 없이 넘어가지 않고 안내만 합니다.", strict: true, parameters: { type: "object", additionalProperties: false, properties: { clientName: { type: "string" } }, required: ["clientName"] } },
  { type: "function", name: "approve_workflow_task", description: "[WRITE] 고객의 현재 단계 체크리스트에서 제목으로 식별되는 업무 하나를 승인하거나 실행합니다. 어떤 업무인지 모호하면 실행하지 않고 되묻습니다.", strict: true, parameters: { type: "object", additionalProperties: false, properties: { clientName: { type: "string" }, taskSelector: { type: ["string", "null"] } }, required: ["clientName", "taskSelector"] } },
  { type: "function", name: "link_document_to_client", description: "[WRITE] 고객 등록·프로젝트 생성 전에 미리 만들어 저장한 견적서/계약서/콘티처럼, 병원명 오타 등으로 고객과 연결되지 않은 자료를 실제 고객에 연결합니다. '이 콘티 OOO병원에 연결해줘' 같은 요청에 씁니다.", strict: true, parameters: { type: "object", additionalProperties: false, properties: { documentType: { type: "string", enum: ["quote", "contract", "conti"] }, documentQuery: { type: "string", description: "저장된 자료를 찾을 검색어 — 저장 당시 입력됐을 병원명만 넣는다('OOO병원'처럼). '콘티'/'견적서'/'계약서' 같은 자료 종류 단어나 조사는 documentType에 이미 있으니 여기 섞지 않는다." }, clientName: { type: "string" } }, required: ["documentType", "documentQuery", "clientName"] } },
  // ── Task Session(코드 요청서 2026-08-17) — Workflow 자체를 새로 안 만들고, 그중 사용자가
  // 지금 실제로 처리 중인 구간만 "지금 하는 일" 묶음으로 보여준다. 완료 여부는 오직 기존
  // workflow_runs.current_step_key로만 판단하므로(lib/olivia/taskSession/nextAction.ts)
  // 이 도구들은 Workflow 상태를 직접 바꾸지 않는다 — 조회하고 workspace를 열어줄 뿐이다.
  { type: "function", name: "start_task_session", description: "[WRITE] '히어 촬영 준비하자'처럼 특정 업무 묶음(Task Session)을 시작합니다. 이미 있으면 이어서 열어줍니다.", strict: true, parameters: { type: "object", additionalProperties: false, properties: { clientName: { type: "string" }, sessionType: { type: "string", enum: ["shoot-prep", "quote-prep", "contract-prep", "delivery", "general"], description: "'촬영 준비'=shoot-prep, '견적'=quote-prep, '계약'=contract-prep, '납품'=delivery, 그 외/불분명=general" } }, required: ["clientName", "sessionType"] } },
  { type: "function", name: "get_task_session_status", description: "[READ] '지금 뭐 남았어?'/'어디까지 했지?' — 진행 중인 Task Session의 완료/남은 항목을 요약합니다.", strict: true, parameters: { type: "object", additionalProperties: false, properties: { clientName: { type: "string" } }, required: ["clientName"] } },
  { type: "function", name: "continue_task_session", description: "[WRITE] '계속하자'/'다음' — 진행 중인 Task Session의 다음 미완료 항목 화면을 엽니다.", strict: true, parameters: { type: "object", additionalProperties: false, properties: { clientName: { type: "string" } }, required: ["clientName"] } },
  { type: "function", name: "pause_task_session", description: "[WRITE] '보류' — 지금 진행 중인 Task Session을 일시정지합니다(완료 처리 아님).", strict: true, parameters: { type: "object", additionalProperties: false, properties: { clientName: { type: "string" } }, required: ["clientName"] } },
  // ── 메일링 ──
  { type: "function", name: "list_mailing_queue", description: "[READ] 대기 중인 메일 큐를 조회합니다.", strict: true, parameters: { type: "object", additionalProperties: false, properties: { clientName: { type: ["string", "null"] }, status: { type: ["string", "null"] } }, required: ["clientName", "status"] } },
  { type: "function", name: "send_mailing", description: "[DESTRUCTIVE] 대기 중인 메일을 실제로 발송합니다. 즉시 발송하지 않고 반드시 승인 요청만 생성합니다.", strict: true, parameters: { type: "object", additionalProperties: false, properties: { mailingId: { type: "string" } }, required: ["mailingId"] } },
  // ── 갤러리 ──
  { type: "function", name: "get_gallery", description: "[READ] 고객의 사진 갤러리를 조회합니다.", strict: true, parameters: { type: "object", additionalProperties: false, properties: { clientName: { type: "string" } }, required: ["clientName"] } },
  { type: "function", name: "create_gallery", description: "[WRITE] 고객 사진 갤러리를 실제로 등록합니다(NAS 링크 필요).", strict: true, parameters: { type: "object", additionalProperties: false, properties: { clientName: { type: "string" }, nasLink: { type: "string" }, description: { type: ["string", "null"] }, shootDate: { type: ["string", "null"] }, thumbnailUrl: { type: ["string", "null"] } }, required: ["clientName", "nasLink", "description", "shootDate", "thumbnailUrl"] } },
  // ── 이메일 (Gmail 연동) ──
  { type: "function", name: "email_search", description: "[READ] Gmail에서 조건에 맞는 이메일을 검색합니다.", strict: true, parameters: { type: "object", additionalProperties: false, properties: { query: { type: ["string", "null"] }, limit: { type: ["number", "null"] } }, required: ["query", "limit"] } },
  { type: "function", name: "email_read", description: "[READ] 이메일 1건의 전체 내용을 읽습니다.", strict: true, parameters: { type: "object", additionalProperties: false, properties: { messageId: { type: "string" } }, required: ["messageId"] } },
  { type: "function", name: "email_summarize", description: "[READ] 이메일 1건을 AI로 요약합니다.", strict: true, parameters: { type: "object", additionalProperties: false, properties: { messageId: { type: "string" } }, required: ["messageId"] } },
  { type: "function", name: "email_create_draft", description: "[WRITE] Gmail 답장 초안을 만듭니다(실제 발송 아님, 사람이 검토 후 발송).", strict: true, parameters: { type: "object", additionalProperties: false, properties: { to: { type: "string" }, subject: { type: "string" }, body: { type: "string" }, threadId: { type: ["string", "null"] }, inReplyTo: { type: ["string", "null"] } }, required: ["to", "subject", "body", "threadId", "inReplyTo"] } },
  // ── 브리핑/인사이트/검색 (전부 READ) ──
  { type: "function", name: "get_today_briefing", description: "[READ] 오늘 하루 브리핑(일정·할일·이슈 요약)을 조회합니다.", strict: true, parameters: { type: "object", additionalProperties: false, properties: {}, required: [] } },
  { type: "function", name: "get_urgent_insights", description: "[READ] 지금 처리가 급한 항목들을 조회합니다.", strict: true, parameters: { type: "object", additionalProperties: false, properties: {}, required: [] } },
  { type: "function", name: "search_client_projects", description: "[READ] 고객/프로젝트를 이름으로 검색합니다.", strict: true, parameters: { type: "object", additionalProperties: false, properties: { query: { type: "string" } }, required: ["query"] } },
  { type: "function", name: "get_project_status", description: "[READ] 특정 프로젝트의 상세 진행 현황을 조회합니다.", strict: true, parameters: { type: "object", additionalProperties: false, properties: { clientName: { type: ["string", "null"] } }, required: ["clientName"] } },
  // ── 미팅 어시스턴트 (전부 READ, 마지막 completeMeeting만 상태 변경) ──
  { type: "function", name: "list_upcoming_meetings", description: "[READ] 다가오는 미팅 목록을 조회합니다.", strict: true, parameters: { type: "object", additionalProperties: false, properties: {}, required: [] } },
  { type: "function", name: "prepare_meeting_brief", description: "[READ] 특정 미팅의 사전 브리핑을 준비합니다.", strict: true, parameters: { type: "object", additionalProperties: false, properties: { meetingId: { type: ["string", "null"] }, clientName: { type: ["string", "null"] } }, required: ["meetingId", "clientName"] } },
  { type: "function", name: "analyze_meeting_memo", description: "[READ] 미팅 메모를 분석해 요약/할일을 추출합니다.", strict: true, parameters: { type: "object", additionalProperties: false, properties: { meetingId: { type: ["string", "null"] }, memo: { type: ["string", "null"] } }, required: ["meetingId", "memo"] } },
  { type: "function", name: "complete_meeting", description: "[WRITE] 미팅을 완료 처리합니다.", strict: true, parameters: { type: "object", additionalProperties: false, properties: { meetingId: { type: "string" } }, required: ["meetingId"] } },
  { type: "function", name: "get_meeting_followups", description: "[READ] 미팅 후속 조치 목록을 조회합니다.", strict: true, parameters: { type: "object", additionalProperties: false, properties: { meetingId: { type: ["string", "null"] } }, required: ["meetingId"] } },
  { type: "function", name: "link_meeting_client", description: "[WRITE] 미팅을 실제 고객과 연결합니다.", strict: true, parameters: { type: "object", additionalProperties: false, properties: { meetingId: { type: "string" }, clientName: { type: "string" } }, required: ["meetingId", "clientName"] } },
  // ── 병원 채널 진단 ──
  { type: "function", name: "run_brand_diagnosis", description: "[READ] 고객의 홈페이지·네이버플레이스·블로그·인스타그램 채널을 분석해 브랜드 진단 점수와 개선점을 제공합니다. URL을 안 주면 등록된 고객 정보의 채널 URL을 사용합니다. 채널 URL이 하나도 없으면 실패합니다. 시간이 걸릴 수 있어요.", strict: true, parameters: { type: "object", additionalProperties: false, properties: { clientName: { type: "string" }, websiteUrl: { type: ["string", "null"] }, naverPlaceUrl: { type: ["string", "null"] }, instagramUrl: { type: ["string", "null"] } }, required: ["clientName", "websiteUrl", "naverPlaceUrl", "instagramUrl"] } },
  // ── 메모 ──
  { type: "function", name: "memo_add", description: "[WRITE] 고객 상담 메모를 실제로 저장합니다.", strict: true, parameters: { type: "object", additionalProperties: false, properties: { clientName: { type: "string" }, content: { type: "string" } }, required: ["clientName", "content"] } },
  // ── 화면 전환 ──
  { type: "function", name: "open_feature", description: "[READ] 사용자가 앱의 특정 기능/화면을 열어달라고 요청할 때 사용합니다(예: \"프롬프터 실행해줘\", \"고객관리 열어줘\", \"콘티 보여줘\", \"일정 열어줘\"). featureQuery에 사용자가 말한 기능 이름을 그대로 넣으면 실제 존재하는 기능과 매칭해서 화면을 엽니다. \"OO병원 고객관리 페이지 열어줘\"처럼 특정 고객을 지정해서 그 고객관리 화면을 열어달라는 요청이면 hospitalName에 그 고객명을 넣는다 — 그러면 고객 목록이 아니라 그 고객이 바로 선택된 화면을 연다(현재는 고객관리 화면만 지원). 다른 도구로 처리되는 요청(예: 특정 고객의 견적서 생성처럼 데이터가 필요한 작업)에는 쓰지 않습니다 — 순수하게 '화면을 연다'는 의도일 때만 씁니다.", strict: true, parameters: { type: "object", additionalProperties: false, properties: { featureQuery: { type: "string" }, hospitalName: { type: ["string", "null"] } }, required: ["featureQuery", "hospitalName"] } },
  // ── 통합 문서 검색 (견적/계약/콘티/메모/갤러리를 한 번에) ──
  { type: "function", name: "search_documents", description: "[READ] 견적서/계약서/콘티/상담메모/갤러리 등 Olivia에 저장된 문서를 자연어로 찾습니다. \"지난/이전/저번/최근 견적(콘티/계약) 보여줘\", \"OO 견적 찾아줘\"처럼 과거 문서를 찾는 요청은 전부 이 도구를 먼저 쓴다 — 못 찾았다고 스스로 추측해서 답하지 않는다. clientName을 알면 반드시 채워 그 고객 범위로 좁히고, 모르면 null로 둔다.", strict: true, parameters: { type: "object", additionalProperties: false, properties: { query: { type: ["string", "null"], description: "고객명/문서 종류를 뺀 나머지 검색어. \"지난\"/\"최근\"/\"저번\" 같은 시점 표현은 넣지 않는다 — 검색은 항상 최신순으로 정렬된다." }, clientName: { type: ["string", "null"] }, documentType: { type: ["string", "null"], description: "\"콘티\"/\"견적\"/\"계약\"/\"메모\"/\"갤러리\"처럼 사용자가 말한 단어 그대로 넣는다 — 코드가 내부적으로 정규화한다." }, limit: { type: ["number", "null"] } }, required: ["query", "clientName", "documentType", "limit"] } },
  { type: "function", name: "open_document", description: "[READ] search_documents 또는 get_recent_documents 결과에서 후보가 1건으로 확실할 때 그 문서를 엽니다. documentId에는 검색 결과의 id 값을 그대로 넣는다 — 후보가 여러 개면 이 도구를 부르지 말고 먼저 사용자에게 어느 것인지 되묻는다.", strict: true, parameters: { type: "object", additionalProperties: false, properties: { documentId: { type: "string" } }, required: ["documentId"] } },
  { type: "function", name: "get_recent_documents", description: "[READ] 특정 고객(또는 전체)의 최근 수정된 문서 목록을 최신순으로 가져옵니다. \"최근 문서 뭐 있어\", \"OO 최근 작업물 보여줘\"류 요청에 쓴다.", strict: true, parameters: { type: "object", additionalProperties: false, properties: { clientName: { type: ["string", "null"] }, documentType: { type: ["string", "null"] }, limit: { type: ["number", "null"] } }, required: ["clientName", "documentType", "limit"] } },
  // ── 채팅 안에서 바로 작업 수행 (client_task 카드 파일럿) ──
  { type: "function", name: "start_select_match_flow", description: "[WRITE] 사용자가 채팅 안에서 바로 사진 셀렉/RAW 매칭 작업을 진행하고 싶어할 때 사용합니다(예: \"사진 셀렉하는 것 도와줘\", \"셀렉 매칭 좀 해줘\", \"고객이 고른 파일 RAW로 찾아줘\"). 페이지를 열어달라는 요청(open_feature가 처리)이 아니라, 채팅에서 파일명을 받고 RAW 폴더를 골라 바로 작업을 끝내고 싶어하는 요청일 때 씁니다. 파라미터는 없습니다 — 호출하면 채팅에 진행 카드가 뜨고 이후 단계는 사용자가 카드에서 직접 진행합니다.", strict: true, parameters: { type: "object", additionalProperties: false, properties: {}, required: [] } },
  // ── 범용 기능 데이터 생성/수정 (코드 요청서 3번 항목, 2026-08-15) ──
  {
    type: "function",
    name: "create_feature_record",
    description: buildFeatureRecordDescription("생성"),
    strict: true,
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        domain: { type: "string", enum: [...OPEN_FEATURE_RECORD_DOMAINS] },
        data: { type: "string", description: "생성할 필드를 담은 JSON 객체 문자열. 예: {\"hospitalName\":\"...\",\"rawMemo\":\"...\"}" },
        requestText: { type: ["string", "null"] },
      },
      required: ["domain", "data", "requestText"],
    },
  },
  {
    type: "function",
    name: "update_feature_record",
    description: buildFeatureRecordDescription("수정"),
    strict: true,
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        domain: { type: "string", enum: [...OPEN_FEATURE_RECORD_DOMAINS] },
        data: { type: "string", description: "수정할 필드만 담은 JSON 객체 문자열" },
        target: { type: "string", description: "수정할 대상의 이름(병원명·제목 등) 또는 ID" },
        requestText: { type: ["string", "null"] },
      },
      required: ["domain", "data", "target", "requestText"],
    },
  },
  // ── Adaptive Memory — 사용자가 채팅으로 가르친 업무 규칙/별칭/선호/교정을 저장·적용한다.
  // "앞으로 이렇게 해"/"기억해" 같은 표현을 이 도구를 호출하는 것 자체가 감지+구조화다 —
  // 별도 분류기 없이, 언제 이 도구를 쓸지는 시스템 프롬프트가 안내하고 구조는 스키마가 강제한다.
  {
    type: "function",
    name: "save_agent_memory",
    description: "[WRITE] 사용자가 채팅으로 새로운 업무 규칙/별칭/선호/문서 작성 방식을 가르칠 때 저장합니다. 같은 key+scope의 규칙이 이미 있으면 덮어씁니다(중복 생성 안 함).",
    strict: true,
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        memoryType: { type: "string", enum: [...OLIVIA_MEMORY_TYPES], description: "business_rule=업무 규칙, alias=별칭, preference=선호, correction=교정, workflow_rule=워크플로우 규칙, document_rule=문서 작성 규칙, tool_behavior=도구 동작" },
        key: { type: "string", description: "영문 snake_case 짧은 식별자. 예: quote_auto_client_project_creation" },
        scope: { type: ["string", "null"], description: "관련된 기능 범위. 예: quote, storyboard, select_match. 특정 기능에 안 묶이면 null." },
        value: { type: "string", description: "규칙 내용을 담은 JSON 객체 문자열. 예: {\"ifClientMissing\":\"create_client_from_request\"}" },
        priority: { type: ["number", "null"], description: "우선순위, 기본 50. 강한 규칙일수록 높게(최대 100)." },
        sourceText: { type: ["string", "null"], description: "사용자가 실제로 한 말 원문." },
      },
      required: ["memoryType", "key", "scope", "value", "priority", "sourceText"],
    },
  },
  {
    type: "function",
    name: "update_agent_memory",
    description: "[WRITE] 이미 저장된 업무 규칙을 사용자가 채팅으로 수정할 때 씁니다(예: '앞으로 프로젝트는 자동 생성하지 마'). key로 기존 규칙을 못 찾으면 실패합니다 — 이때는 먼저 list_agent_memories로 정확한 key를 확인하세요.",
    strict: true,
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        key: { type: "string" },
        scope: { type: ["string", "null"] },
        value: { type: "string", description: "바뀐 필드만 담은 JSON 객체 문자열(기존 값과 병합됨)" },
        priority: { type: ["number", "null"] },
      },
      required: ["key", "scope", "value", "priority"],
    },
  },
  {
    type: "function",
    name: "disable_agent_memory",
    description: "[WRITE] 사용자가 '그 규칙 취소해'/'별칭 삭제해'처럼 이미 가르친 규칙을 더 이상 쓰지 말라고 할 때 비활성화합니다(완전 삭제가 아니라 soft delete). 정확한 key를 모르면 먼저 list_agent_memories로 확인하세요.",
    strict: true,
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        key: { type: "string" },
        scope: { type: ["string", "null"] },
      },
      required: ["key", "scope"],
    },
  },
  {
    type: "function",
    name: "list_agent_memories",
    description: "[READ] 사용자가 '내가 가르친 규칙 보여줘'처럼 저장된 업무 규칙을 확인하고 싶어할 때 씁니다. scope를 주면 그 범위만, 안 주면 전체를 보여줍니다.",
    strict: true,
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        scope: { type: ["string", "null"] },
      },
      required: ["scope"],
    },
  },
  // ── 사진 분류 씬 편집(PHASE 4, 2026-08-30) — 실제 실행은 지금 열려 있는 PhotoSortingWorkspace
  // 안에서만 가능하다(파일시스템 핸들이 클라이언트에만 있음). 이 도구들은 "지금 화면이 열려
  // 있는지"만 확인하고 실제 실행은 client_task 이후 ui_action(RENAME/MERGE/SPLIT_PHOTO_SCENE)이
  // 처리한다 — 사람이 왼쪽 화면에서 직접 이름을 바꾸는 것과 정확히 같은 함수를 호출한다.
  { type: "function", name: "rename_photo_scene", description: "현재 사진 분류 화면의 씬 이름을 바꿉니다. sceneNumber를 생략하면 지금 선택된 씬을 사용합니다.", strict: true, parameters: { type: "object", additionalProperties: false, properties: { sceneNumber: { type: ["number", "null"], description: "1부터 시작하는 씬 번호. 생략하면 지금 선택된 씬." }, newName: { type: "string" } }, required: ["sceneNumber", "newName"] } },
  { type: "function", name: "merge_photo_scenes", description: "현재 사진 분류 화면에서 두 씬을 하나로 합칩니다. sceneNumberA를 생략하면 지금 선택된 씬을 사용합니다.", strict: true, parameters: { type: "object", additionalProperties: false, properties: { sceneNumberA: { type: ["number", "null"], description: "1부터 시작하는 씬 번호. 생략하면 지금 선택된 씬." }, sceneNumberB: { type: "number", description: "1부터 시작하는 씬 번호." } }, required: ["sceneNumberA", "sceneNumberB"] } },
  { type: "function", name: "split_photo_scene", description: "현재 사진 분류 화면에서 한 씬을 지정한 사진 위치에서 둘로 나눕니다. sceneNumber를 생략하면 지금 선택된 씬을 사용합니다.", strict: true, parameters: { type: "object", additionalProperties: false, properties: { sceneNumber: { type: ["number", "null"], description: "1부터 시작하는 씬 번호. 생략하면 지금 선택된 씬." }, splitBeforePhotoNumber: { type: "number", description: "이 씬 안에서 몇 번째(1부터) 사진부터 새 씬으로 나눌지." } }, required: ["sceneNumber", "splitBeforePhotoNumber"] } },
];

function text(input: Record<string, unknown>, key: string) {
  const value = input[key];
  return typeof value === "string" ? value.trim() : "";
}

function toDocSummary(doc: OliviaDocumentRef) {
  return {
    id: doc.id,
    type: doc.type,
    typeLabel: DOCUMENT_TYPE_LABELS[doc.type],
    title: doc.title,
    clientName: doc.clientName ?? undefined,
    projectName: doc.projectName ?? undefined,
    status: doc.status ?? undefined,
    updatedAt: doc.updatedAt ?? undefined,
  };
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

function activeResource(context: OliviaContextSnapshot, workspace: "quote" | "conti" | "contract") {
  if (context.activeWorkspace !== workspace || !context.activeResourceId) {
    throw new Error(`먼저 수정할 ${workspace === "quote" ? "견적서" : workspace === "contract" ? "계약서" : "콘티"}를 열어주세요.`);
  }
  return context.activeResourceId;
}

// PHASE 4(2026-08-30) — 사진 분류 씬은 DB row가 아니라 화면에 열려 있는 PhotoSortingWorkspace의
// 로컬 state라 activeResourceId 개념이 없다. 대신 명시된 번호나 지금 선택된 씬(selectedEntityId,
// "이 씬"류 팔로우업)으로 대상을 정한다 — 1부터 시작하는 화면 표시 번호를 그대로 쓴다.
function resolvePhotoSceneNumber(input: Record<string, unknown>, key: string, context: OliviaContextSnapshot): number {
  const explicit = input[key];
  if (explicit != null) {
    const n = Number(explicit);
    if (!Number.isFinite(n) || n < 1) throw new Error("씬 번호를 확인해주세요.");
    return n;
  }
  if (context.selectedEntityType === "photo_scene" && context.selectedEntityId) {
    const n = Number(context.selectedEntityId);
    if (Number.isFinite(n) && n >= 1) return n;
  }
  throw new Error("몇 번 씬인지 알려주세요.");
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
  const rawPosition = input.position;
  const position = rawPosition == null ? undefined : resolveOrdinalReference(String(rawPosition), quoteItems(quote.items).length);
  const matches = resolveQuoteItem(quote.items, text(input, "selector"), selected, position);
  if (matches.length !== 1) {
    const choices = matches.map(({ item }) => item.name).join(", ");
    throw new Error(choices ? `대상 항목이 여러 개예요: ${choices}` : "수정할 견적 항목을 찾지 못했어요.");
  }
  return matches[0];
}

function contiTarget(conti: Record<string, unknown>, input: Record<string, unknown>, context: OliviaContextSnapshot) {
  const rawPosition = input.position;
  const shotCount = normalizeContiResult(conti.result).conti.length;
  const position = rawPosition == null ? undefined : resolveOrdinalReference(String(rawPosition), shotCount);
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

    // Adaptive Memory Execution Policy — "앞으로 견적 요청에 고객이 없으면 자동등록해" 같은
    // 사용자가 가르친 규칙이 활성화돼 있으면, 고객/프로젝트가 없어도 등록해달라고 되묻지 않고
    // 여기서 직접 찾거나 만든다. 규칙이 없으면(마이그레이션 미적용 포함) 정책 값이 전부 falsy라
    // 아래 분기가 전혀 실행되지 않고 기존 동작 그대로다.
    const quoteMemories = await listActiveMemories(db, { scopes: ["quote"] });
    const policy = resolveExecutionPolicy(quoteMemories);
    let clientId = context.activeClientId;
    let workflowRunId = context.activeProjectId;
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
    const hospitalName = text(input, "hospitalName") || context.activeClientName || (quote ? String(quote.hospital_name || "") : "");
    if (!quote) {
      if (!hospitalName) throw new Error("계약서를 만들 고객을 먼저 알려주세요.");
      quote = await latestResource("quote", { ...context, activeClientName: hospitalName });
    }
    if (!quote) throw new Error("계약서의 기준이 될 견적서를 먼저 만들어주세요.");
    const finalHospitalName = hospitalName || String(quote.hospital_name || "");
    if (!finalHospitalName) throw new Error("계약서를 만들 고객을 먼저 알려주세요.");
    const execution = await executeOliviaCrud(db, {
      operation: "create",
      domain: "contract",
      data: {
        quoteNumber: quote.quote_number,
        hospitalName: finalHospitalName,
        contactName: quote.contact_name,
        email: quote.email,
        quoteData: quote,
        workflowRunId: context.activeProjectId,
      },
      requestText: `${finalHospitalName} 계약서 생성`,
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
    const quoteData = (contract.quote_data && typeof contract.quote_data === "object") ? contract.quote_data as Record<string, unknown> : {};
    const totalAmount = Number(quoteData.totalAmount) || 0;
    const summary = depositRate != null
      ? (() => {
          const amounts = computeContractDeposit(totalAmount, depositRate as number);
          return `계약 조건을 수정했어요. 계약금 ${depositRate}%(${amounts.depositAmount.toLocaleString("ko-KR")}원), 잔금 ${amounts.balanceAmount.toLocaleString("ko-KR")}원이에요.`;
        })()
      : "계약 조건을 수정했어요.";
    return { tool: name, success: true, data: { resourceId, contractId: resourceId, updatedResource, summary } };
  }

  if (name === "request_contract_signature") {
    const resourceId = activeResource(context, "contract");
    const contract = await loadContractRow(resourceId);
    return { tool: name, success: true, data: { resourceId, contractId: resourceId, hospitalName: contract.hospital_name, summary: "대표 서명이 필요해요." } };
  }

  if (name === "request_contract_publish") {
    const resourceId = activeResource(context, "contract");
    const contract = await loadContractRow(resourceId);
    const quoteData = (contract.quote_data && typeof contract.quote_data === "object") ? contract.quote_data as Record<string, unknown> : {};
    return { tool: name, success: true, data: { resourceId, contractId: resourceId, approvalRequired: true, hospitalName: contract.hospital_name, summary: `${contract.hospital_name || "현재 고객"} 계약서(${Number(quoteData.totalAmount || 0).toLocaleString("ko-KR")}원)를 최종 생성할까요?` } };
  }

  if (name === "publish_contract") {
    const resourceId = activeResource(context, "contract");
    const contract = await loadContractRow(resourceId);
    // 최종 생성 전 필수 확인(스펙 §28) — 부족한 항목만 짚어서 되묻는다. 실제 고객/프로젝트
    // 연결 검증은 기존 /api/contracts/[id]/publish 라우트가 그대로 한다(중복 구현 안 함).
    const quoteData = (contract.quote_data && typeof contract.quote_data === "object") ? contract.quote_data as Record<string, unknown> : {};
    const missing: string[] = [];
    if (!contract.hospital_name) missing.push("고객명");
    if (!(Number(quoteData.totalAmount) > 0)) missing.push("계약 금액");
    if (!quoteData.shootDate) missing.push("촬영 예정일");
    if (!contract.signature_data_url) missing.push("대표 서명");
    if (missing.length) throw new Error(`아직 부족한 항목이 있어요: ${missing.join(", ")}`);
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://127.0.0.1:3000";
    const response = await fetch(`${baseUrl}/api/contracts/${resourceId}/publish`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId: context.activeClientId, workflowRunId: context.activeProjectId }),
    });
    const payload = await response.json();
    if (!response.ok || !payload.ok) throw new Error(payload.error || "계약서를 최종 생성하지 못했어요.");
    const updatedResource = await saveContractRow(resourceId, { status: "final" });
    return { tool: name, success: true, data: { resourceId, contractId: resourceId, updatedResource, ...payload, summary: "계약서를 최종 생성했어요." } };
  }

  if (name === "download_contract_pdf") {
    // download_quote_pdf와 동일한 원칙 — PDF는 브라우저에 열려 있는 ContractBuilder의
    // html2canvas/jsPDF로만 만들 수 있어 서버는 DB를 건드리지 않는다. 실제 다운로드는 client가
    // DOWNLOAD_CONTRACT_PDF ui_action을 받아 처리한다.
    const resourceId = activeResource(context, "contract");
    return { tool: name, success: true, data: { resourceId, contractId: resourceId, summary: "PDF를 준비하고 있어요…" } };
  }

  if (name === "get_conti_status") {
    return fromLegacyResult(name, await getContiStatus({ hospitalName: text(input, "hospitalName") || context.activeClientName }));
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

  // ── 범용 기능 데이터 생성/수정 (코드 요청서 3·4번 항목, 2026-08-15) ──
  if (name === "create_feature_record" || name === "update_feature_record") {
    const domain = text(input, "domain") as OliviaCrudDomain;
    if (!OPEN_FEATURE_RECORD_DOMAINS.includes(domain)) {
      throw new Error(`"${domain}"은(는) 아직 챗에서 직접 생성·수정할 수 없는 기능이에요.`);
    }
    let data: Record<string, unknown>;
    try {
      const parsed = JSON.parse(text(input, "data") || "{}");
      data = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
    } catch {
      throw new Error("data 형식(JSON 객체 문자열)이 올바르지 않아요.");
    }
    const operation = name === "create_feature_record" ? "create" as const : "update" as const;
    let target: OliviaCrudTarget | undefined;
    if (operation === "update") {
      const targetRaw = text(input, "target");
      if (!targetRaw) throw new Error("수정할 대상의 이름이나 ID가 필요해요.");
      target = isUuid(targetRaw) ? { id: targetRaw } : { name: targetRaw };
    }

    const crudRequest: OliviaCrudRequest = {
      operation,
      domain,
      data,
      target,
      requestText: text(input, "requestText") || undefined,
    };
    const validated = validateOliviaCrudRequest(crudRequest);

    // owner_only 필드가 섞이면 바로 실행하지 않고 승인 카드를 띄운다(코드 요청서 4번 항목) —
    // 실제 실행은 uiActionResolvers의 create_feature_record/update_feature_record 리졸버가
    // 만드는 REQUEST_APPROVAL 카드를 사용자가 확인해야 apply_feature_record_write로만 이뤄진다.
    if (validated.permission === "owner_only") {
      const fieldsSummary = Object.entries(validated.data)
        .slice(0, 6)
        .map(([key, value]) => `${key}: ${typeof value === "object" ? JSON.stringify(value) : String(value)}`)
        .join(", ");
      return {
        tool: name,
        success: true,
        data: {
          approvalRequired: true,
          domain,
          operation,
          crudData: validated.data,
          target,
          summary: `${validated.definition.label} ${operation === "create" ? "생성" : "수정"} — ${fieldsSummary}. 승인이 필요한 항목(${validated.ownerOnlyChanged.join(", ")})이 포함돼 있어요. 진행할까요?`,
        },
      };
    }

    const execution = await executeOliviaCrud(db, crudRequest);
    const reviewRequired = validated.permission === "review_required";
    const reviewNote = reviewRequired ? " (검토가 필요한 변경입니다.)" : "";
    return {
      tool: name,
      success: true,
      data: {
        recordId: execution.recordId,
        domain: execution.domain,
        operation: execution.operation,
        url: execution.url,
        // reviewRequired가 true면 모델이 summary를 재구성하며 이 안내를 누락할 수 있어
        // 별도 필드로도 노출한다 — operating_rules에서 이 필드를 그대로 전달하라고 명시한다.
        reviewRequired,
        reviewNotice: reviewRequired ? "검토가 필요한 변경입니다." : undefined,
        summary: `${execution.message}${reviewNote}`,
      },
    };
  }

  // apply_feature_record_write는 모델에게 노출되지 않는다 — /api/olivia/v2/approve가 승인 카드의
  // toolInput(operation/domain/crudData/target)을 그대로 실어 호출할 때만 실제로 DB에 쓴다.
  if (name === "apply_feature_record_write") {
    const operation = text(input, "operation") === "update" ? "update" as const : "create" as const;
    const domain = text(input, "domain") as OliviaCrudDomain;
    const data = input.crudData && typeof input.crudData === "object" && !Array.isArray(input.crudData)
      ? input.crudData as Record<string, unknown>
      : {};
    const target = input.target && typeof input.target === "object" && !Array.isArray(input.target)
      ? input.target as OliviaCrudTarget
      : undefined;
    const execution = await executeOliviaCrud(db, { operation, domain, data, target });
    return {
      tool: name,
      success: true,
      data: {
        recordId: execution.recordId,
        domain: execution.domain,
        operation: execution.operation,
        url: execution.url,
        summary: execution.message,
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
    return { tool: name, success: true, data: { resourceId, quoteId: resourceId, updatedResource, summary: "견적서 정보를 수정했어요." } };
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
    };
  }

  if (name === "request_quote_publish") {
    const resourceId = activeResource(context, "quote");
    const quote = await loadQuote(resourceId);
    return { tool: name, success: true, data: { resourceId, quoteId: resourceId, approvalRequired: true, hospitalName: quote.hospital_name, totalAmount: quote.total_amount, quoteNumber: quote.quote_number, summary: `${quote.hospital_name || "현재 고객"} 견적 ${quote.quote_number || ""}, 총액 ${Number(quote.total_amount || 0).toLocaleString("ko-KR")}원을 고객 포털에 공개할까요?` } };
  }

  if (name === "download_quote_pdf") {
    // PDF는 브라우저에 열려 있는 QuoteBuilder의 html2canvas/jsPDF로만 만들 수 있어 서버는
    // DB를 건드리지 않는다 — 여기서는 "지금 견적서 화면이 실제로 열려 있는지"만 activeResource로
    // 검증하고, 실제 다운로드는 client가 DOWNLOAD_QUOTE_PDF ui_action을 받아 사람이 누르는
    // 버튼과 완전히 같은 downloadPdf() 함수를 호출해 처리한다. 성공 여부는 그 클라이언트
    // 실행이 끝난 뒤에만 확정되므로, 여기 success:true는 "요청을 접수했다"는 뜻이지 "PDF가
    // 만들어졌다"는 뜻이 아니다 — actionRouter.ts가 실제 결과를 채팅에 별도로 보고한다.
    const resourceId = activeResource(context, "quote");
    return { tool: name, success: true, data: { resourceId, quoteId: resourceId, summary: "PDF를 준비하고 있어요…" } };
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
    // 만족한다.
    const summary = newlyLinkedClientId
      ? `견적서를 고객 포털에 공개했어요. ${quoteBeforePublish.hospital_name || "해당 병원"}을 신규 고객으로 등록했어요.`
      : "견적서를 고객 포털에 공개했어요.";
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
    };
  }

  if (["add_conti_shots", "update_conti_shot", "remove_conti_shot", "apply_remove_conti_shot", "reorder_conti_shot", "duplicate_conti_shot", "estimate_conti_duration", "generate_shoot_prep_from_conti"].includes(name)) {
    const resourceId = activeResource(context, "conti");
    const conti = await loadConti(resourceId);
    if (name === "add_conti_shots") {
      const rawItems = Array.isArray(input.items) ? input.items as Record<string, unknown>[] : [];
      if (!rawItems.length) throw new Error("추가할 항목을 확인해주세요.");
      const items = rawItems.map((item) => ({
        category: text(item, "category"),
        keyword: text(item, "keyword") || undefined,
        personnel: text(item, "personnel") || undefined,
        location: text(item, "location") || undefined,
        description: text(item, "description") || undefined,
        notes: text(item, "notes") || undefined,
      }));
      const selected = context.selectedEntityType === "conti-shot" ? resolveContiShot(conti.result, { shotId: context.selectedEntityId })[0] : undefined;
      const rawInsertAfter = input.insertAfter;
      const insertAfterInput = rawInsertAfter == null || rawInsertAfter === "" ? undefined : Number(rawInsertAfter);
      const insertAfter = insertAfterInput !== undefined && Number.isInteger(insertAfterInput) && insertAfterInput >= 0 ? insertAfterInput : selected?.index;
      const mutation = addContiShots(conti.result, { items, insertAfter });
      const updatedResource = await saveConti(resourceId, mutation.result);
      return { tool: name, success: true, data: { resourceId, contiId: resourceId, changedEntityId: mutation.created[0]?.id, updatedResource, summary: `${items.length}개 항목을 추가했어요.` } };
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

  // ── 캘린더 ──
  if (name === "calendar_list") {
    const tasks = await listCalendarTasks(text(input, "date"));
    return { tool: name, success: true, data: { date: text(input, "date"), tasks } };
  }
  if (name === "calendar_add") {
    if (input.time) {
      const existing = await listCalendarTasks(text(input, "date"));
      const conflicts = findCalendarConflicts(existing, input.time as string, 60);
      if (conflicts.length > 0) {
        const labels = conflicts.slice(0, 3).map((task: any) => `${task.time} ${task.title}`).join(", ");
        throw new Error(`같은 시간대에 등록된 일정이 있습니다: ${labels}. 시간을 변경하거나 기존 일정을 먼저 확인해 주세요.`);
      }
    }
    const id = await addCalendarTask(input);
    return { tool: name, success: true, data: { taskId: id, summary: `"${text(input, "title")}" 일정을 추가했어요.` } };
  }
  if (name === "calendar_add_bulk") {
    const tasks = Array.isArray(input.tasks) ? input.tasks as any[] : [];
    const created: string[] = [];
    for (const task of tasks) {
      const id = await addCalendarTask(task);
      if (id) created.push(id);
    }
    return { tool: name, success: true, data: { createdCount: created.length, taskIds: created, summary: `일정 ${created.length}건을 추가했어요.` } };
  }
  if (name === "calendar_update") {
    const id = await resolveCalendarTaskId(input);
    const { matchTitle: _matchTitle, ...fields } = input;
    await updateCalendarTask({ ...fields, id });
    return { tool: name, success: true, data: { taskId: id, summary: "일정을 수정했어요." } };
  }
  if (name === "calendar_complete") {
    const id = await resolveCalendarTaskId(input);
    await updateCalendarTask({ id, completed: true });
    return { tool: name, success: true, data: { taskId: id, summary: "일정을 완료 처리했어요." } };
  }
  if (name === "calendar_delete") {
    const id = await resolveCalendarTaskId(input);
    await deleteCalendarTask(id);
    return { tool: name, success: true, data: { taskId: id, summary: "일정을 삭제했어요(휴지통에서 복원 가능)." } };
  }
  if (name === "calendar_availability") {
    const existing = await listCalendarTasks(text(input, "date"));
    const conflicts = input.time ? findCalendarConflicts(existing, input.time as string, 60) : [];
    return { tool: name, success: true, data: { date: text(input, "date"), conflicts, hasConflict: conflicts.length > 0 } };
  }
  if (name === "calendar_list_month") {
    const { data: tasks, error } = await db
      .from("calendar_tasks")
      .select("*")
      .gte("date", `${text(input, "month")}-01`)
      .lt("date", `${text(input, "month")}-32`)
      .order("date", { ascending: true })
      .order("time", { ascending: true, nullsFirst: false });
    if (error) throw new Error(error.message);
    return { tool: name, success: true, data: { month: text(input, "month"), tasks: tasks ?? [] } };
  }

  // ── 워크플로우 ──
  if (name === "get_workflow_status") return fromLegacyResult(name, await getWorkflowStatus(input));
  if (name === "list_active_workflows") {
    const { data: runs, error } = await db
      .from("workflow_runs")
      .select("id, client_id, client_name, current_step_key, status, updated_at")
      .eq("status", "active")
      .order("updated_at", { ascending: false })
      .limit(30);
    if (error) throw new Error("진행 중인 프로젝트를 불러오지 못했어요.");
    return { tool: name, success: true, data: { runs: runs ?? [], count: runs?.length ?? 0 } };
  }
  if (name === "advance_workflow_step") return fromLegacyResult(name, await advanceWorkflowStep(input));
  if (name === "complete_workflow_retroactively") return fromLegacyResult(name, await completeWorkflowRetroactively(input));
  if (name === "list_workflow_step_tasks") return fromLegacyResult(name, await listWorkflowStepTasks(input));
  if (name === "process_workflow_step") return fromLegacyResult(name, await processWorkflowStep(input));
  if (name === "approve_workflow_task") return fromLegacyResult(name, await approveWorkflowTask(input));
  if (name === "link_document_to_client") return fromLegacyResult(name, await linkDocumentToClient(input));
  if (name === "start_task_session") {
    return fromLegacyResult(name, await startTaskSession({ ...input, clientName: text(input, "clientName") || context.activeClientName }));
  }
  if (name === "get_task_session_status") {
    return fromLegacyResult(name, await getTaskSessionStatus({ clientName: text(input, "clientName") || context.activeClientName }));
  }
  if (name === "continue_task_session") {
    return fromLegacyResult(name, await continueTaskSession({ clientName: text(input, "clientName") || context.activeClientName }));
  }
  if (name === "pause_task_session") {
    return fromLegacyResult(name, await pauseTaskSession({ clientName: text(input, "clientName") || context.activeClientName }));
  }

  // ── 메일링 (발송은 승인 필요 — send_mailing은 미리보기만, apply_send_mailing이 실제 발송) ──
  if (name === "list_mailing_queue") return fromLegacyResult(name, await listMailingQueue(input));
  if (name === "send_mailing") {
    const mailingId = text(input, "mailingId");
    if (!mailingId) throw new Error("발송할 메일 ID를 확인해주세요.");
    return { tool: name, success: true, data: { mailingId, approvalRequired: true, summary: `메일(ID: ${mailingId})을 발송할까요? 실제 고객에게 전송됩니다.` } };
  }
  if (name === "apply_send_mailing") {
    return fromLegacyResult(name, await sendMailing({ mailingId: text(input, "mailingId") }));
  }

  // ── 갤러리 ──
  if (name === "get_gallery") return fromLegacyResult(name, await getGallery(input));
  if (name === "create_gallery") return fromLegacyResult(name, await createGallery(input));

  // ── 이메일 (Gmail) ──
  if (["email_search", "email_read", "email_summarize", "email_create_draft"].includes(name)) {
    const owner = await ensurePrimaryAssistantOwner(db);
    if (name === "email_search") {
      const result = await searchAssistantEmail(db, owner.id, input);
      return { tool: name, success: true, data: result };
    }
    if (name === "email_read") {
      const result = await readAssistantEmail(db, owner.id, input);
      return { tool: name, success: true, data: result };
    }
    if (name === "email_summarize") {
      const result = await summarizeAssistantEmail(db, owner.id, input);
      return { tool: name, success: true, data: result };
    }
    const result = await createAssistantEmailDraft(db, owner.id, input);
    return { tool: name, success: true, data: result };
  }

  // ── 브리핑/인사이트/검색/미팅 — 기존 chatWorkTools.ts 디스패처를 그대로 재사용 ──
  if (OLIVIA_CHAT_WORK_TOOL_NAMES.has(name) || ["list_upcoming_meetings", "prepare_meeting_brief", "analyze_meeting_memo", "complete_meeting", "get_meeting_followups", "link_meeting_client"].includes(name)) {
    const result = await executeOliviaChatWorkTool(db, name, input, {});
    return fromLegacyResult(name, result);
  }

  // ── 병원 채널 진단 — lib/channelAnalysis.ts의 /channel-analyzer 로직을 그대로 재사용 ──
  if (name === "run_brand_diagnosis") {
    const clientName = text(input, "clientName");
    const client = await fuzzyNameSearchOne<any>({
      db, table: "clients", nameColumn: "hospital_name",
      select: "id, hospital_name, specialty, website_url, instagram_url, naver_place_url",
      query: clientName,
    });
    const urls = {
      web: text(input, "websiteUrl") || client?.website_url || undefined,
      naver: text(input, "naverPlaceUrl") || client?.naver_place_url || undefined,
      insta: text(input, "instagramUrl") || client?.instagram_url || undefined,
    };
    if (!urls.web && !urls.naver && !urls.insta) {
      throw new Error(`${client?.hospital_name || clientName}의 등록된 채널 URL이 없어요. 홈페이지·네이버플레이스·인스타그램 중 하나라도 알려주세요.`);
    }
    const { result } = await analyzeChannels({ hospitalName: client?.hospital_name || clientName, specialty: client?.specialty, urls });
    return {
      tool: name,
      success: true,
      data: {
        clientId: client?.id,
        clientName: client?.hospital_name || clientName,
        overallScore: result.overall_score,
        summary: result.overall_summary,
        coverage: result.coverage_summary,
        issues: result.seo_insights,
        packageRecommendation: result.package_recommendation,
      },
    };
  }

  // ── 메모 ──
  if (name === "memo_add") {
    const client = await fuzzyNameSearchOne<any>({ db, table: "clients", nameColumn: "hospital_name", select: "id, hospital_name", query: text(input, "clientName") });
    await db.from("consultation_memos").insert({
      hospital_id: client?.id ?? null,
      raw_memo: text(input, "content"),
      summary: text(input, "content").slice(0, 200),
      extracted_data: {},
    });
    return { tool: name, success: true, data: { clientName: client?.hospital_name || text(input, "clientName"), summary: "메모를 저장했어요." } };
  }

  if (name === "start_select_match_flow") {
    // 서버 작업 없음 — flowId만 발급하면 클라이언트가 그 값으로 채팅 카드/스토어를 초기화한다.
    // 실제 폴더 스캔·복사는 전부 브라우저(File System Access API)에서만 가능해서 여기선 할 수 없다.
    return { tool: name, success: true, data: { flowId: crypto.randomUUID() } };
  }

  if (name === "open_feature") {
    const query = text(input, "featureQuery");
    const resolution = resolveFeatureIntent(query);
    if (resolution.kind === "match") {
      let href = resolution.tool.href;
      // "OO병원 고객관리 페이지 열어줘"처럼 고객명이 함께 오면, 고객 목록만 여는 게 아니라 그
      // 고객이 바로 선택된 화면으로 딥링크한다 — /clients?clientId=만 이 방식을 지원 확인됨
      // (다른 화면은 고객별 진입점이 없어 아직 못 한다, 2026-08-16 사용자 리포트).
      const hospitalName = text(input, "hospitalName");
      if (hospitalName && href === "/clients") {
        const client = await fuzzyNameSearchOne<{ id: string; hospital_name: string }>({
          db, table: "clients", nameColumn: "hospital_name", select: "id, hospital_name", query: hospitalName,
        });
        if (client) href = `/clients?clientId=${encodeURIComponent(client.id)}`;
      }
      // 0.85 미만(완전 일치가 아닌 애매한 매칭)은 바로 열지 않고 한 문장으로 확인부터 하도록
      // needsConfirmation을 신호로 보낸다 — 시스템 프롬프트가 이 값을 보고 확인 질문을 한다.
      if (resolution.confidence < 0.85) {
        return {
          tool: name,
          success: true,
          data: { matched: false, needsConfirmation: true, featureName: resolution.tool.title, href, confidence: resolution.confidence },
        };
      }
      return { tool: name, success: true, data: { matched: true, featureName: resolution.tool.title, href } };
    }
    if (resolution.kind === "ambiguous") {
      return {
        tool: name,
        success: true,
        data: { matched: false, ambiguous: true, candidates: resolution.candidates.map((candidate) => candidate.title) },
      };
    }
    // kind === "none" — 완전히 못 찾았어도 근접 후보가 있으면 dead-end 대신 후보를 보여준다.
    if (resolution.candidates?.length) {
      return {
        tool: name,
        success: true,
        data: { matched: false, ambiguous: true, candidates: resolution.candidates.map((candidate) => candidate.title) },
      };
    }
    return { tool: name, success: false, error: OLIVIA_FALLBACK_MESSAGES.featureNotFoundSoft(query) };
  }

  if (name === "search_documents" || name === "get_recent_documents") {
    const query = name === "search_documents" ? text(input, "query") : "";
    const clientName = text(input, "clientName") || undefined;
    const documentType = normalizeDocumentTypeHint(input.documentType);
    const limitInput = input.limit == null ? undefined : parseKoreanCount(input.limit as string | number);
    const docs = await searchDocuments({
      query,
      clientName,
      types: documentType ? [documentType] : undefined,
      limit: limitInput || 8,
      currentClientId: context.activeClientId,
      currentProjectId: context.activeProjectId,
    });
    if (name === "get_recent_documents") {
      return { tool: name, success: true, data: { documents: docs.map(toDocSummary) } };
    }
    if (!docs.length) {
      const scopeLabel = [clientName, documentType ? DOCUMENT_TYPE_LABELS[documentType] : undefined].filter(Boolean).join(" ");
      return { tool: name, success: false, error: `${scopeLabel ? `${scopeLabel} ` : ""}문서를 찾지 못했어요. 고객명이나 문서 종류를 조금만 더 알려주세요.` };
    }
    return {
      tool: name,
      success: true,
      data: { matched: docs.length === 1, ambiguous: docs.length > 1, documents: docs.map(toDocSummary) },
    };
  }

  if (name === "open_document") {
    const documentId = text(input, "documentId");
    const sep = documentId.indexOf(":");
    const sourceType = sep >= 0 ? documentId.slice(0, sep) : documentId;
    const sourceId = sep >= 0 ? documentId.slice(sep + 1) : "";
    if (!sourceId) throw new Error("어떤 문서인지 확인하지 못했어요.");

    if (sourceType === "quote" || sourceType === "contract" || sourceType === "conti") {
      const table = sourceType === "quote" ? "quotes" : sourceType === "contract" ? "contracts" : "conti_saves";
      const { data: row } = await db.from(table).select("id, hospital_name, client_id, workflow_run_id").eq("id", sourceId).maybeSingle();
      if (!row) throw new Error("문서를 찾지 못했어요.");
      const typeLabel = DOCUMENT_TYPE_LABELS[sourceType === "conti" ? "storyboard" : sourceType];
      return {
        tool: name,
        success: true,
        data: {
          workspace: sourceType,
          resourceId: String(row.id),
          clientId: row.client_id || undefined,
          workflowRunId: row.workflow_run_id || undefined,
          hospitalName: row.hospital_name || undefined,
          summary: `${row.hospital_name || "고객"} ${typeLabel}을 열었어요.`,
        },
      };
    }
    if (sourceType === "select_gallery") {
      return { tool: name, success: true, data: { href: `/select-galleries/${sourceId}`, summary: "셀렉 갤러리를 열었어요." } };
    }
    if (sourceType === "memo" || sourceType === "photo_gallery") {
      const table = sourceType === "memo" ? "consultation_memos" : "photo_galleries";
      const clientColumn = sourceType === "memo" ? "hospital_id" : "client_id";
      const { data: row } = await db.from(table).select(`id, ${clientColumn}`).eq("id", sourceId).maybeSingle();
      const clientId = (row as Record<string, unknown> | null)?.[clientColumn];
      if (!clientId) throw new Error("문서를 찾지 못했어요.");
      return { tool: name, success: true, data: { href: `/clients?clientId=${clientId}`, summary: "관련 고객 화면을 열었어요." } };
    }
    throw new Error("지원하지 않는 문서 종류예요.");
  }

  if (name === "save_agent_memory") {
    const memoryType = text(input, "memoryType") as OliviaMemoryType;
    if (!OLIVIA_MEMORY_TYPES.includes(memoryType)) throw new Error("지원하지 않는 규칙 종류예요.");
    const key = text(input, "key");
    if (!key) throw new Error("규칙을 식별할 key가 필요해요.");
    const scope = text(input, "scope") || null;
    let value: Record<string, unknown>;
    try {
      value = JSON.parse(text(input, "value") || "{}");
    } catch {
      throw new Error("규칙 내용을 이해하지 못했어요.");
    }
    const priority = typeof input.priority === "number" ? input.priority : undefined;
    const existing = await findMemoryByKeyScope(db, key, scope);
    const saved = existing
      ? await updateMemory(db, existing.id, { value, priority })
      : await createMemory(db, { memoryType, key, value, scope, priority, source: "user_teaching" });
    if (!saved) throw new Error("업무 규칙 저장에 실패했어요.");
    return { tool: name, success: true, data: { id: saved.id, key, scope, summary: formatMemoryForUser(saved) } };
  }

  if (name === "update_agent_memory") {
    const key = text(input, "key");
    const scope = text(input, "scope") || null;
    if (!key) throw new Error("수정할 규칙의 key가 필요해요.");
    const existing = await findMemoryByKeyScope(db, key, scope);
    if (!existing) throw new Error(`"${key}" 규칙을 찾지 못했어요. list_agent_memories로 정확한 key를 먼저 확인해주세요.`);
    const rawValue = text(input, "value");
    let mergedValue: Record<string, unknown> | undefined;
    if (rawValue) {
      try {
        mergedValue = { ...existing.value, ...JSON.parse(rawValue) };
      } catch {
        throw new Error("규칙 내용을 이해하지 못했어요.");
      }
    }
    const priority = typeof input.priority === "number" ? input.priority : undefined;
    const saved = await updateMemory(db, existing.id, { value: mergedValue, priority });
    if (!saved) throw new Error("업무 규칙 수정에 실패했어요.");
    return { tool: name, success: true, data: { id: saved.id, key, scope, summary: formatMemoryForUser(saved) } };
  }

  if (name === "disable_agent_memory") {
    const key = text(input, "key");
    const scope = text(input, "scope") || null;
    if (!key) throw new Error("삭제할 규칙의 key가 필요해요.");
    const existing = await findMemoryByKeyScope(db, key, scope);
    if (!existing) throw new Error(`"${key}" 규칙을 찾지 못했어요.`);
    await deactivateMemory(db, existing.id);
    return { tool: name, success: true, data: { key, scope, summary: `"${key}" 규칙을 더 이상 적용하지 않을게요.` } };
  }

  if (name === "list_agent_memories") {
    const scope = text(input, "scope") || undefined;
    const memories = await listActiveMemories(db, scope ? { scopes: [scope] } : {});
    return {
      tool: name,
      success: true,
      data: { count: memories.length, items: memories.map((memory) => ({ key: memory.key, scope: memory.scope, summary: formatMemoryForUser(memory) })) },
    };
  }

  if (name === "rename_photo_scene") {
    if (context.activeWorkspace !== "photo-sort") throw new Error("먼저 사진 분류 화면을 열어주세요.");
    const sceneNumber = resolvePhotoSceneNumber(input, "sceneNumber", context);
    const newName = text(input, "newName");
    if (!newName) throw new Error("바꿀 이름을 알려주세요.");
    return { tool: name, success: true, data: { sceneIndex: sceneNumber - 1, newName, summary: `${sceneNumber}번 씬 이름을 바꿀게요.` } };
  }

  if (name === "merge_photo_scenes") {
    if (context.activeWorkspace !== "photo-sort") throw new Error("먼저 사진 분류 화면을 열어주세요.");
    const sceneNumberA = resolvePhotoSceneNumber(input, "sceneNumberA", context);
    const sceneNumberB = Number(input.sceneNumberB);
    if (!Number.isFinite(sceneNumberB) || sceneNumberB < 1) throw new Error("합칠 씬 번호를 확인해주세요.");
    return { tool: name, success: true, data: { sceneIndexA: sceneNumberA - 1, sceneIndexB: sceneNumberB - 1, summary: `${sceneNumberA}번과 ${sceneNumberB}번 씬을 합칠게요.` } };
  }

  if (name === "split_photo_scene") {
    if (context.activeWorkspace !== "photo-sort") throw new Error("먼저 사진 분류 화면을 열어주세요.");
    const sceneNumber = resolvePhotoSceneNumber(input, "sceneNumber", context);
    const splitBeforePhotoNumber = Number(input.splitBeforePhotoNumber);
    if (!Number.isFinite(splitBeforePhotoNumber) || splitBeforePhotoNumber < 2) throw new Error("나눌 사진 위치를 확인해주세요.");
    return { tool: name, success: true, data: { sceneIndex: sceneNumber - 1, offset: splitBeforePhotoNumber - 1, summary: `${sceneNumber}번 씬을 나눌게요.` } };
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
    return { result: { tool: toolCall.name, success: false, error: OLIVIA_FALLBACK_MESSAGES.toolInputUnreadable }, uiActions: [] };
  }

  try {
    const result = await runTool(toolCall.name, input, context);
    const uiActions = await resolveUiActions({ toolCall, input, result, context });
    return { result, uiActions };
  } catch (error) {
    const normalized = normalizeToolError(error);
    console.error("[olivia-v2] tool execution failed", toolCall.name, normalized.logDetail);
    return {
      result: {
        tool: toolCall.name,
        success: false,
        error: normalized.userMessage,
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
