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
import { fuzzyNameSearchOne } from "@/lib/olivia/nameSearch";
import { analyzeChannels } from "@/lib/channelAnalysis";
import { resolveFeatureIntent } from "@/lib/olivia/features/resolver";

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
  // ── 캘린더 (READ/WRITE, 실제 DB — trash로 되돌릴 수 있어 승인 없이 실행) ──
  { type: "function", name: "calendar_list", description: "[READ] 특정 날짜의 실제 일정 목록을 조회합니다.", strict: true, parameters: { type: "object", additionalProperties: false, properties: { date: { type: "string", description: "YYYY-MM-DD" } }, required: ["date"] } },
  { type: "function", name: "calendar_add", description: "[WRITE] 새 일정을 실제 캘린더에 추가합니다. 삭제(trash)로 되돌릴 수 있습니다.", strict: true, parameters: { type: "object", additionalProperties: false, properties: { date: { type: "string" }, title: { type: "string" }, time: { type: ["string", "null"] }, location: { type: ["string", "null"] }, memo: { type: ["string", "null"] }, category: { type: ["string", "null"] } }, required: ["date", "title", "time", "location", "memo", "category"] } },
  { type: "function", name: "calendar_add_bulk", description: "[WRITE] 여러 일정을 한 번에 실제 캘린더에 추가합니다.", strict: true, parameters: { type: "object", additionalProperties: false, properties: { tasks: { type: "array", items: { type: "object", additionalProperties: false, properties: { date: { type: "string" }, title: { type: "string" }, time: { type: ["string", "null"] }, location: { type: ["string", "null"] } }, required: ["date", "title", "time", "location"] } } }, required: ["tasks"] } },
  { type: "function", name: "calendar_update", description: "[WRITE] 기존 일정을 id 또는 date+matchTitle로 찾아 실제로 수정합니다.", strict: true, parameters: { type: "object", additionalProperties: false, properties: { id: { type: ["string", "null"] }, date: { type: ["string", "null"] }, matchTitle: { type: ["string", "null"] }, title: { type: ["string", "null"] }, time: { type: ["string", "null"] }, location: { type: ["string", "null"] }, memo: { type: ["string", "null"] } }, required: ["id", "date", "matchTitle", "title", "time", "location", "memo"] } },
  { type: "function", name: "calendar_complete", description: "[WRITE] 일정을 완료 처리합니다.", strict: true, parameters: { type: "object", additionalProperties: false, properties: { id: { type: ["string", "null"] }, date: { type: ["string", "null"] }, matchTitle: { type: ["string", "null"] } }, required: ["id", "date", "matchTitle"] } },
  { type: "function", name: "calendar_delete", description: "[WRITE] 일정을 삭제합니다(휴지통 30일 보관, 복원 가능).", strict: true, parameters: { type: "object", additionalProperties: false, properties: { id: { type: ["string", "null"] }, date: { type: ["string", "null"] }, matchTitle: { type: ["string", "null"] } }, required: ["id", "date", "matchTitle"] } },
  { type: "function", name: "calendar_availability", description: "[READ] 특정 날짜의 일정 충돌 여부를 확인합니다. DB 변경 없음.", strict: true, parameters: { type: "object", additionalProperties: false, properties: { date: { type: "string" }, time: { type: ["string", "null"] } }, required: ["date", "time"] } },
  { type: "function", name: "calendar_list_month", description: "[READ] 특정 월(또는 이번주처럼 여러 날) 전체 일정을 한 번에 조회합니다. 하루씩 여러 번 부르지 않고 이 도구를 씁니다.", strict: true, parameters: { type: "object", additionalProperties: false, properties: { month: { type: "string", description: "YYYY-MM" } }, required: ["month"] } },
  // ── 워크플로우 ──
  { type: "function", name: "get_workflow_status", description: "[READ] 고객의 현재 워크플로우 단계를 조회합니다.", strict: true, parameters: { type: "object", additionalProperties: false, properties: { clientName: { type: "string" } }, required: ["clientName"] } },
  { type: "function", name: "list_active_workflows", description: "[READ] 지금 진행 중인 프로젝트(워크플로우) 전체 목록을 조회합니다. 특정 고객명이 없을 때 이 도구를 씁니다.", strict: true, parameters: { type: "object", additionalProperties: false, properties: {}, required: [] } },
  { type: "function", name: "advance_workflow_step", description: "[WRITE] 고객의 워크플로우를 지정한 단계로 이동합니다.", strict: true, parameters: { type: "object", additionalProperties: false, properties: { clientName: { type: "string" }, toStepKey: { type: "string" } }, required: ["clientName", "toStepKey"] } },
  { type: "function", name: "complete_workflow_retroactively", description: "[WRITE] 고객의 워크플로우 전체를 소급 완료 처리합니다(이미 끝난 실제 업무를 뒤늦게 기록할 때).", strict: true, parameters: { type: "object", additionalProperties: false, properties: { clientName: { type: "string" }, reason: { type: ["string", "null"] } }, required: ["clientName", "reason"] } },
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
  { type: "function", name: "open_feature", description: "[READ] 사용자가 앱의 특정 기능/화면을 열어달라고 요청할 때 사용합니다(예: \"프롬프터 실행해줘\", \"고객관리 열어줘\", \"콘티 보여줘\", \"일정 열어줘\"). featureQuery에 사용자가 말한 기능 이름을 그대로 넣으면 실제 존재하는 기능과 매칭해서 화면을 엽니다. 다른 도구로 처리되는 요청(예: 특정 고객의 견적서 생성처럼 데이터가 필요한 작업)에는 쓰지 않습니다 — 순수하게 '화면을 연다'는 의도일 때만 씁니다.", strict: true, parameters: { type: "object", additionalProperties: false, properties: { featureQuery: { type: "string" } }, required: ["featureQuery"] } },
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
    await updateCalendarTask({ ...input, id });
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

  if (name === "open_feature") {
    const query = text(input, "featureQuery");
    const resolution = resolveFeatureIntent(query);
    if (resolution.kind === "match") {
      return { tool: name, success: true, data: { matched: true, featureName: resolution.tool.title, href: resolution.tool.href } };
    }
    if (resolution.kind === "ambiguous") {
      return {
        tool: name,
        success: true,
        data: { matched: false, ambiguous: true, candidates: resolution.candidates.map((candidate) => candidate.title) },
      };
    }
    return { tool: name, success: false, error: `"${query}"에 해당하는 기능을 찾지 못했어요. 앱에 존재하지 않는 기능이거나 다른 이름으로 불리고 있을 수 있어요.` };
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
