import type { FunctionTool } from "openai/resources/responses/responses";
import { resolveUiActions } from "@/lib/olivia/agent/uiActionResolvers";
import type {
  OliviaAgentToolExecution,
  OliviaContextSnapshot,
  OliviaToolCall,
  OliviaToolResult,
} from "@/lib/olivia/v2/types";
import { OLIVIA_MEMORY_TYPES, OLIVIA_PROMOTABLE_MEMORY_TYPES } from "@/lib/olivia/memory/types";
import { normalizeToolError, OLIVIA_FALLBACK_MESSAGES } from "@/lib/olivia/output/errorMessages";
import { OliviaToolError } from "@/lib/olivia/v2/toolError";
import { mergeVerification } from "./toolExecutors/verification";
import { QUOTE_TOOL_NAMES, executeQuoteTool } from "./toolExecutors/quote";
import { CONTRACT_TOOL_NAMES, executeContractTool } from "./toolExecutors/contract";
import { CALENDAR_TOOL_NAMES, executeCalendarTool } from "./toolExecutors/calendar";
import { WORKFLOW_TOOL_NAMES, executeWorkflowTool } from "./toolExecutors/workflow";
import { CLIENT_TOOL_NAMES, executeClientTool } from "./toolExecutors/client";
import { DOCUMENT_TOOL_NAMES, executeDocumentTool } from "./toolExecutors/document";
import { MEMORY_TOOL_NAMES, executeMemoryTool } from "./toolExecutors/memory";
import { PHOTO_CLASSIFICATION_TOOL_NAMES, executePhotoClassificationTool } from "./toolExecutors/photoClassification";
import { PHOTO_STORAGE_TOOL_NAMES, executePhotoStorageTool } from "./toolExecutors/photoStorage";
import { COMMON_TOOL_NAMES, executeCommonTool } from "./toolExecutors/common";
import { REMOTE_FINDER_TOOL_NAMES, executeRemoteFinderTool } from "./toolExecutors/remoteFinder";
import { NAS_BACKUP_TOOL_NAMES, executeNasBackupTool } from "./toolExecutors/nasBackup";
import { PHOTO_OPERATION_TOOL_NAMES, executePhotoOperationTool } from "./toolExecutors/photoOperations";
import { GALLERY_TOOL_NAMES, executeGalleryTool } from "./toolExecutors/gallery";
import { validateMutationIntent } from "./mutationIntentGuard";

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
    description: "사용자가 견적서를 만들어 달라고 했을 때 호출합니다. 금액·항목·담당자·연락처를 직접 옮겨 적지 않습니다. 서버가 이번 사용자 원문을 직접 읽습니다. brand만 대화에서 확인됐으면 넣고, 아니면 null로 둡니다.",
    strict: true,
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        brand: { type: ["string", "null"], enum: ["photoclinic", "jakeimage", null] },
      },
      required: ["brand"],
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
  { type: "function", name: "complete_contract", description: "[WRITE] 현재 계약서를 내부적으로 최종완료하고 계약 단계에서 콘티 단계로 진행합니다. 고객 포털에는 공개하지 않습니다.", strict: true, parameters: { type: "object", additionalProperties: false, properties: {}, required: [] } },
  { type: "function", name: "request_contract_publish", description: "현재 계약서를 고객 포털에 공개하기 위한 승인을 요청합니다. 내부 최종완료와 별개이며 확인 전에는 공개하지 않습니다.", strict: true, parameters: { type: "object", additionalProperties: false, properties: {}, required: [] } },
  { type: "function", name: "download_contract_pdf", description: "현재 화면에 열려 있는 계약서를 PDF로 저장하고 다운로드합니다. 계약서 화면이 열려 있지 않으면 실행할 수 없습니다.", strict: true, parameters: { type: "object", additionalProperties: false, properties: {}, required: [] } },
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
  { type: "function", name: "update_quote_note", description: "현재 견적서의 전체 메모를 수정합니다. \"메모를 바꿔줘\"/\"견적 메모에 OO 추가해줘\"처럼 명확히 메모를 언급했을 때만 쓴다. 선금/잔금 비율 같은 결제조건은 이 도구로 바꾸지 않는다 — 그런 요청은 update_quote_payment_terms를 쓴다.", strict: true, parameters: { type: "object", additionalProperties: false, properties: { note: { type: "string" } }, required: ["note"] } },
  { type: "function", name: "update_quote_info", description: "현재 견적서의 병원명/담당자/연락처/이메일/견적일/촬영일/유효기한/제목처럼 항목·금액이 아닌 기본 정보를 실제 DB에 수정합니다. 언급된 값만 채우고 나머지는 null로 둡니다. 선금/잔금 비율 같은 결제조건은 여기 포함되지 않는다 — update_quote_payment_terms를 쓴다.", strict: true, parameters: { type: "object", additionalProperties: false, properties: { hospitalName: { type: ["string", "null"] }, contactName: { type: ["string", "null"] }, phone: { type: ["string", "null"] }, email: { type: ["string", "null"] }, quoteDate: { type: ["string", "null"] }, shootDate: { type: ["string", "null"] }, validUntil: { type: ["string", "null"] }, quoteTitle: { type: ["string", "null"] } }, required: ["hospitalName", "contactName", "phone", "email", "quoteDate", "shootDate", "validUntil", "quoteTitle"] } },
  { type: "function", name: "update_quote_payment_terms", description: "현재 견적서의 결제조건(선금/잔금 비율)을 실제 DB에 수정합니다. \"선금 OO%로 바꿔\"/\"잔금 OO%로 해줘\"/\"선금 없애줘\"/\"전액 잔금으로 해줘\"처럼 결제조건을 바꾸는 요청은 반드시 이 도구를 쓴다 — update_quote_note(메모)나 update_quote_info(기본 정보)로 처리하지 않는다. depositPercent/balancePercent 중 사용자가 언급한 기준 하나만 채우면 나머지는 자동으로 100에서 뺀 값이 된다. 0도 유효한 값이다(전액 잔금 = depositPercent 0).", strict: true, parameters: { type: "object", additionalProperties: false, properties: { depositPercent: { type: ["number", "null"], description: "선금 비율(%). 예: 0, 30, 50" }, balancePercent: { type: ["number", "null"], description: "잔금 비율(%). 사용자가 잔금 기준으로 말했을 때 채운다. 예: 100, 70" } }, required: ["depositPercent", "balancePercent"] } },
  { type: "function", name: "update_quote_service", description: "현재 견적서의 포함 촬영 서비스만 수정하거나 제거합니다. 프로필/연출의 컷 수, 단체의 컨셉/납품 장수는 가격 quantity나 패키지 추가 인원을 바꾸지 않습니다. 같은 quoteId의 form_state.includedServices와 0원 표시 항목을 함께 갱신합니다.", strict: true, parameters: { type: "object", additionalProperties: false, properties: { selector: { type: ["string", "null"] }, serviceType: { type: ["string", "null"], enum: ["profile", "staged", "group", "interior", "video", "other", null] }, label: { type: ["string", "null"] }, personCount: { type: ["number", "null"] }, cutCount: { type: ["number", "null"] }, conceptCount: { type: ["number", "null"] }, deliverableCount: { type: ["number", "null"] }, description: { type: ["string", "null"] }, remove: { type: "boolean" } }, required: ["selector", "serviceType", "label", "personCount", "cutCount", "conceptCount", "deliverableCount", "description", "remove"] } },
  { type: "function", name: "apply_quote_discount", description: "현재 견적서에 원 단위 또는 퍼센트 할인을 적용하거나 제거합니다.", strict: true, parameters: { type: "object", additionalProperties: false, properties: { amount: { type: ["number", "string", "null"] }, percent: { type: ["number", "null"] }, remove: { type: "boolean" } }, required: ["amount", "percent", "remove"] } },
  { type: "function", name: "preview_quote", description: "이미 견적서 작업 화면이 활성화돼 있을 때 그 현재 견적서의 미리보기를 엽니다. search_documents/get_recent_documents로 찾은 문서를 처음 여는 요청에는 사용하지 말고 open_document에 검색 결과 id를 전달합니다. DB 변경은 없습니다.", strict: true, parameters: { type: "object", additionalProperties: false, properties: {}, required: [] } },
  { type: "function", name: "request_quote_publish", description: "현재 견적서 공개 승인을 요청합니다. 확인 전에는 공개하지 않습니다.", strict: true, parameters: { type: "object", additionalProperties: false, properties: {}, required: [] } },
  { type: "function", name: "download_quote_pdf", description: "현재 화면에 열려 있는 견적서를 PDF로 저장하고 다운로드합니다. 견적서 화면이 열려 있지 않으면 실행할 수 없습니다.", strict: true, parameters: { type: "object", additionalProperties: false, properties: {}, required: [] } },
  { type: "function", name: "resolve_quote_client", description: "[READ] 견적서에 아직 고객이 연결되어 있지 않으면, 견적서의 병원명으로 등록된 고객을 찾아봅니다. 견적서를 최종 승인한 직후 \"OO을 고객으로 등록할까요?\"라고 물어보기 전에 씁니다. quoteId를 비우면 지금 열려 있는 견적서를 씁니다.", strict: true, parameters: { type: "object", additionalProperties: false, properties: { quoteId: { type: ["string", "null"] } }, required: ["quoteId"] } },
  { type: "function", name: "link_new_client_to_quote", description: "[WRITE] resolve_quote_client로 확인한 후보를 이 견적서에 연결합니다. clientId를 채우면 이미 있는 고객에 연결하고, 비우면(hospitalName으로) 새 고객을 등록한 뒤 연결합니다.", strict: true, parameters: { type: "object", additionalProperties: false, properties: { resourceId: { type: "string" }, clientId: { type: ["string", "null"] }, hospitalName: { type: ["string", "null"] }, contactName: { type: ["string", "null"] }, phone: { type: ["string", "null"] }, email: { type: ["string", "null"] } }, required: ["resourceId", "clientId", "hospitalName", "contactName", "phone", "email"] } },
  {
    type: "function",
    name: "show_workspace",
    description: "현재 고객과 프로젝트를 유지하면서 견적서·계약서·콘티·사진 작업실 Workspace를 엽니다.",
    strict: true,
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: { workspace: { type: "string", enum: ["quote", "contract", "conti", "photo-sort"] } },
      required: ["workspace"],
    },
  },
  { type: "function", name: "calendar_list", description: "[READ] 특정 날짜의 실제 일정 목록을 조회합니다.", strict: true, parameters: { type: "object", additionalProperties: false, properties: { date: { type: "string", description: "YYYY-MM-DD" } }, required: ["date"] } },
  { type: "function", name: "calendar_add", description: "[WRITE] 새 일정을 실제 캘린더에 추가합니다. 삭제(trash)로 되돌릴 수 있습니다.", strict: true, parameters: { type: "object", additionalProperties: false, properties: { date: { type: "string" }, title: { type: "string" }, time: { type: ["string", "null"] }, location: { type: ["string", "null"] }, memo: { type: ["string", "null"] }, category: { type: ["string", "null"] } }, required: ["date", "title", "time", "location", "memo", "category"] } },
  { type: "function", name: "calendar_add_bulk", description: "[WRITE] 여러 일정을 한 번에 실제 캘린더에 추가합니다.", strict: true, parameters: { type: "object", additionalProperties: false, properties: { tasks: { type: "array", items: { type: "object", additionalProperties: false, properties: { date: { type: "string" }, title: { type: "string" }, time: { type: ["string", "null"] }, location: { type: ["string", "null"] } }, required: ["date", "title", "time", "location"] } } }, required: ["tasks"] } },
  { type: "function", name: "calendar_update", description: "[WRITE] 기존 일정을 id 또는 date+matchTitle로 찾아 실제로 수정합니다.", strict: true, parameters: { type: "object", additionalProperties: false, properties: { id: { type: ["string", "null"] }, date: { type: ["string", "null"] }, matchTitle: { type: ["string", "null"] }, title: { type: ["string", "null"] }, time: { type: ["string", "null"] }, location: { type: ["string", "null"] }, memo: { type: ["string", "null"] }, category: { type: ["string", "null"], enum: ["shooting", "client", "admin", "personal", "general", null], description: "촬영=shooting, 고객=client, 행정=admin, 개인=personal, 기타=general. app/calendar/page.tsx의 CATS 색상 범례와 같은 5개 값 — 그 이름을 언급하면 바로 이 값으로 채운다." } }, required: ["id", "date", "matchTitle", "title", "time", "location", "memo", "category"] } },
  { type: "function", name: "calendar_complete", description: "[WRITE] 일정을 완료 처리합니다.", strict: true, parameters: { type: "object", additionalProperties: false, properties: { id: { type: ["string", "null"] }, date: { type: ["string", "null"] }, matchTitle: { type: ["string", "null"] } }, required: ["id", "date", "matchTitle"] } },
  { type: "function", name: "calendar_delete", description: "[WRITE] 일정을 삭제합니다(휴지통 30일 보관, 복원 가능).", strict: true, parameters: { type: "object", additionalProperties: false, properties: { id: { type: ["string", "null"] }, date: { type: ["string", "null"] }, matchTitle: { type: ["string", "null"] } }, required: ["id", "date", "matchTitle"] } },
  { type: "function", name: "calendar_availability", description: "[READ] 특정 날짜의 일정 충돌 여부를 확인합니다. DB 변경 없음.", strict: true, parameters: { type: "object", additionalProperties: false, properties: { date: { type: "string" }, time: { type: ["string", "null"] } }, required: ["date", "time"] } },
  { type: "function", name: "calendar_list_month", description: "[READ] 특정 월(또는 이번주처럼 여러 날) 전체 일정을 한 번에 조회합니다. 하루씩 여러 번 부르지 않고 이 도구를 씁니다.", strict: true, parameters: { type: "object", additionalProperties: false, properties: { month: { type: "string", description: "YYYY-MM" } }, required: ["month"] } },
  { type: "function", name: "get_workflow_status", description: "[READ] 고객의 현재 워크플로우 단계를 조회합니다.", strict: true, parameters: { type: "object", additionalProperties: false, properties: { clientName: { type: "string" } }, required: ["clientName"] } },
  { type: "function", name: "get_project_snapshot", description: "[READ] 정확한 workflow run의 Olivia Core 프로젝트 Snapshot을 조회합니다. 프로젝트/단계/견적/계약/콘티 상태를 대화 이력으로 추측하지 말고 이 결과를 사용합니다. workflowRunId가 없으면 현재 선택된 프로젝트를 사용합니다.", strict: true, parameters: { type: "object", additionalProperties: false, properties: { workflowRunId: { type: ["string", "null"] } }, required: ["workflowRunId"] } },
  { type: "function", name: "list_active_workflows", description: "[READ] 지금 진행 중인 프로젝트(워크플로우) 전체 목록을 조회합니다. 특정 고객명이 없을 때 이 도구를 씁니다.", strict: true, parameters: { type: "object", additionalProperties: false, properties: {}, required: [] } },
  { type: "function", name: "advance_workflow_step", description: "[WRITE] 고객의 워크플로우를 지정한 단계로 이동합니다. 견적/계약/콘티 단계에 실제 문서가 없으면 건너뛰지 않고 안내만 합니다.", strict: true, parameters: { type: "object", additionalProperties: false, properties: { clientName: { type: "string" }, toStepKey: { type: "string" } }, required: ["clientName", "toStepKey"] } },
  { type: "function", name: "complete_workflow_retroactively", description: "[WRITE] 고객의 워크플로우 전체를 소급 완료 처리합니다(이미 끝난 실제 업무를 뒤늦게 기록할 때).", strict: true, parameters: { type: "object", additionalProperties: false, properties: { clientName: { type: "string" }, reason: { type: ["string", "null"] } }, required: ["clientName", "reason"] } },
  { type: "function", name: "list_workflow_step_tasks", description: "[READ] 고객의 현재 워크플로우 단계에 있는 '업무 프로세스' 체크리스트(할 일 목록과 상태)를 조회합니다.", strict: true, parameters: { type: "object", additionalProperties: false, properties: { clientName: { type: "string" } }, required: ["clientName"] } },
  { type: "function", name: "process_workflow_step", description: "[WRITE] '올리비아가 현재 단계 처리하기' 버튼과 동일합니다 — 고객의 현재 단계에 대기 중인 업무를 전부 처리합니다. 견적서/계약서/콘티 단계에서는 실제 문서 없이 넘어가지 않고 안내만 합니다.", strict: true, parameters: { type: "object", additionalProperties: false, properties: { clientName: { type: "string" } }, required: ["clientName"] } },
  { type: "function", name: "approve_workflow_task", description: "[WRITE] 고객의 현재 단계 체크리스트에서 제목으로 식별되는 업무 하나를 승인하거나 실행합니다. 어떤 업무인지 모호하면 실행하지 않고 되묻습니다.", strict: true, parameters: { type: "object", additionalProperties: false, properties: { clientName: { type: "string" }, taskSelector: { type: ["string", "null"] } }, required: ["clientName", "taskSelector"] } },
  { type: "function", name: "link_document_to_client", description: "[WRITE] 신규 고객 등록 도구가 아닙니다. 고객·프로젝트보다 먼저 만들어 둔 견적서/계약서/콘티를 이미 등록된 고객에게 연결합니다. '이 콘티 OOO병원에 연결해줘' 같은 문서 연결 요청에만 씁니다.", strict: true, parameters: { type: "object", additionalProperties: false, properties: { documentType: { type: "string", enum: ["quote", "contract", "conti"] }, documentQuery: { type: "string", description: "저장된 자료를 찾을 검색어 — 저장 당시 입력됐을 병원명만 넣는다('OOO병원'처럼). '콘티'/'견적서'/'계약서' 같은 자료 종류 단어나 조사는 documentType에 이미 있으니 여기 섞지 않는다." }, clientName: { type: "string" } }, required: ["documentType", "documentQuery", "clientName"] } },
  { type: "function", name: "search_client_projects", description: "[READ] 고객/프로젝트를 이름으로 검색합니다.", strict: true, parameters: { type: "object", additionalProperties: false, properties: { query: { type: "string" } }, required: ["query"] } },
  { type: "function", name: "get_project_status", description: "[READ] 특정 프로젝트의 상세 진행 현황을 조회합니다.", strict: true, parameters: { type: "object", additionalProperties: false, properties: { clientName: { type: ["string", "null"] } }, required: ["clientName"] } },
  { type: "function", name: "open_feature", description: "[READ] 사용자가 앱의 특정 기능/화면을 열어달라고 요청할 때 사용합니다(예: \"프롬프터 실행해줘\", \"고객관리 열어줘\", \"콘티 보여줘\", \"일정 열어줘\"). featureQuery에 사용자가 말한 기능 이름을 그대로 넣으면 실제 존재하는 기능과 매칭해서 화면을 엽니다. \"OO병원 고객관리 페이지 열어줘\"처럼 특정 고객을 지정해서 그 고객관리 화면을 열어달라는 요청이면 hospitalName에 그 고객명을 넣는다 — 그러면 고객 목록이 아니라 그 고객이 바로 선택된 화면을 연다(현재는 고객관리 화면만 지원). 다른 도구로 처리되는 요청(예: 특정 고객의 견적서 생성처럼 데이터가 필요한 작업)에는 쓰지 않습니다 — 순수하게 '화면을 연다'는 의도일 때만 씁니다.", strict: true, parameters: { type: "object", additionalProperties: false, properties: { featureQuery: { type: "string" }, hospitalName: { type: ["string", "null"] } }, required: ["featureQuery", "hospitalName"] } },
  { type: "function", name: "maximize_active_window", description: "[WRITE] 사용자가 \"크게 보여줘\", \"창 키워줘\", \"전체화면으로\"처럼 지금 포커스된 창을 최대화해달라고 할 때 사용합니다. 파라미터는 없습니다.", strict: true, parameters: { type: "object", additionalProperties: false, properties: {}, required: [] } },
  { type: "function", name: "close_active_window", description: "[WRITE] 사용자가 \"이 창 닫아줘\", \"이거 닫아\"처럼 지금 포커스된 창을 닫아달라고 할 때 사용합니다. 파라미터는 없습니다.", strict: true, parameters: { type: "object", additionalProperties: false, properties: {}, required: [] } },
  { type: "function", name: "minimize_active_window", description: "[WRITE] 사용자가 \"최소화해줘\", \"내려줘\"처럼 지금 포커스된 창을 최소화해달라고 할 때 사용합니다(닫는 것과 다름 — 창은 Dock에 그대로 남는다). 파라미터는 없습니다.", strict: true, parameters: { type: "object", additionalProperties: false, properties: {}, required: [] } },
  { type: "function", name: "search_documents", description: "[READ] 견적서/계약서/콘티/상담메모/갤러리 등 Olivia에 저장된 문서를 자연어로 찾습니다. \"지난/이전/저번/최근 견적(콘티/계약) 보여줘\", \"OO 견적 찾아줘\", \"OO클리닉 견적서 열어줘\"처럼 기존 문서를 가리키는 요청은 전부 이 도구를 먼저 쓴다 — 못 찾았다고 스스로 추측해서 답하지 않는다. \"견적서 만들자\"처럼 새로 만드는 요청에는 절대 쓰지 않는다(create_quote를 쓴다). clientName을 알면 반드시 채워 그 고객 범위로 좁히고, 모르면 null로 둔다.", strict: true, parameters: { type: "object", additionalProperties: false, properties: { query: { type: ["string", "null"], description: "고객명/문서 종류를 뺀 나머지 검색어. \"지난\"/\"최근\"/\"저번\" 같은 시점 표현은 넣지 않는다 — 검색은 항상 최신순으로 정렬된다." }, clientName: { type: ["string", "null"] }, documentType: { type: ["string", "null"], description: "\"콘티\"/\"견적\"/\"계약\"/\"메모\"/\"갤러리\"처럼 사용자가 말한 단어 그대로 넣는다 — 코드가 내부적으로 정규화한다." }, limit: { type: ["number", "null"] } }, required: ["query", "clientName", "documentType", "limit"] } },
  { type: "function", name: "open_document", description: "[READ] search_documents 또는 get_recent_documents로 찾은 저장 문서를 열기/띄우기/보여주기 요청에 사용합니다. 후보가 1건으로 확실할 때 documentId에 검색 결과의 id(예: quote:<uuid>)를 그대로 넣습니다. preview_quote 대신 이 도구를 사용합니다. 후보가 여러 개면 먼저 사용자에게 어느 것인지 되묻습니다.", strict: true, parameters: { type: "object", additionalProperties: false, properties: { documentId: { type: "string" } }, required: ["documentId"] } },
  { type: "function", name: "get_recent_documents", description: "[READ] 특정 고객(또는 전체)의 최근 수정된 문서 목록을 최신순으로 가져옵니다. \"최근 문서 뭐 있어\", \"OO 최근 작업물 보여줘\"류 요청에 쓴다.", strict: true, parameters: { type: "object", additionalProperties: false, properties: { clientName: { type: ["string", "null"] }, documentType: { type: ["string", "null"] }, limit: { type: ["number", "null"] } }, required: ["clientName", "documentType", "limit"] } },
  { type: "function", name: "list_temporary_documents", description: "[READ] 고객과 아직 연결되지 않은 임시문서를 실제 DB에서 찾습니다. '예전에 만든 OO병원 문서', '임시문서 보여줘'처럼 이미 만들어 둔 문서를 찾을 때 호출해 정확한 temporaryDocumentId를 얻습니다. 신규 고객 등록에는 쓰지 않습니다.", strict: true, parameters: { type: "object", additionalProperties: false, properties: { hospitalName: { type: ["string", "null"] }, query: { type: ["string", "null"] }, limit: { type: ["number", "null"] } }, required: ["hospitalName", "query", "limit"] } },
  { type: "function", name: "approve_temporary_document", description: "[WRITE] 사용자가 이미지로 확인한 임시문서 내용에 첫 번째로 오케이/승인했을 때, 임시문서를 기존 고객에 연결할지 묻는 대기 상태로 바꿉니다. 이 단계에서는 신규 고객을 등록하지 않습니다.", strict: true, parameters: { type: "object", additionalProperties: false, properties: { temporaryDocumentId: { type: "string" } }, required: ["temporaryDocumentId"] } },
  { type: "function", name: "defer_temporary_document", description: "[WRITE] 임시문서를 기존 고객에 연결하는 작업이나 문서 내용 승인을 보류할 때 원본을 삭제하지 않고 임시문서함에 유지합니다. 신규 고객 등록 도구가 아닙니다.", strict: true, parameters: { type: "object", additionalProperties: false, properties: { temporaryDocumentId: { type: "string" } }, required: ["temporaryDocumentId"] } },
  { type: "function", name: "link_temporary_document_client", description: "[WRITE] 임시문서를 기존 고객에 연결할지 묻는 질문에 사용자가 두 번째로 명시적 승인했을 때만 호출합니다. 해당 고객의 workflow를 재사용하고 같은 병원명의 열린 임시문서를 연결합니다. 일반 신규 고객 등록 요청에는 쓰지 않습니다.", strict: true, parameters: { type: "object", additionalProperties: false, properties: { temporaryDocumentId: { type: "string" } }, required: ["temporaryDocumentId"] } },
  { type: "function", name: "start_select_match_flow", description: "[WRITE] 사용자가 채팅 안에서 바로 사진 셀렉/RAW 매칭 작업을 진행하고 싶어할 때 사용합니다(예: \"사진 셀렉하는 것 도와줘\", \"셀렉 매칭 좀 해줘\", \"고객이 고른 파일 RAW로 찾아줘\"). 페이지를 열어달라는 요청(open_feature가 처리)이 아니라, 채팅에서 파일명을 받고 RAW 폴더를 골라 바로 작업을 끝내고 싶어하는 요청일 때 씁니다. 파라미터는 없습니다 — 호출하면 채팅에 진행 카드가 뜨고 이후 단계는 사용자가 카드에서 직접 진행합니다.", strict: true, parameters: { type: "object", additionalProperties: false, properties: {}, required: [] } },
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
  {
    type: "function",
    name: "propose_agent_memory_rule",
    description: "Hermes가 반복적으로 관찰한 패턴을 공식 업무 규칙 '후보'로 제안합니다. 바로 적용되지 않고 사용자 승인(approve_agent_memory_rule) 전까지는 아무 동작에도 영향을 주지 않습니다. 확실하지 않은 규칙을 함부로 save_agent_memory로 저장하지 말고 이 도구로 먼저 제안하세요.",
    strict: true,
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        key: { type: "string", description: "영문 snake_case 짧은 식별자." },
        scope: { type: ["string", "null"] },
        proposedType: { type: "string", enum: [...OLIVIA_PROMOTABLE_MEMORY_TYPES], description: "승인되면 적용될 규칙 종류." },
        proposedValue: { type: "string", description: "승인되면 적용될 규칙 내용 JSON 문자열." },
        reason: { type: "string", description: "왜 이 규칙을 제안하는지 근거(관찰한 사례 등)." },
      },
      required: ["key", "scope", "proposedType", "proposedValue", "reason"],
    },
  },
  {
    type: "function",
    name: "approve_agent_memory_rule",
    description: "[WRITE] 제안된 규칙 후보를 공식 업무 규칙으로 확정합니다. 사용자가 명시적으로 승인했을 때만 호출하세요 — 최종 승인은 항상 사용자의 몫입니다.",
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
  { type: "function", name: "rename_photo_scene", description: "현재 사진 분류 화면의 씬 이름을 바꿉니다. sceneNumber를 생략하면 지금 선택된 씬을 사용합니다.", strict: true, parameters: { type: "object", additionalProperties: false, properties: { sceneNumber: { type: ["number", "null"], description: "1부터 시작하는 씬 번호. 생략하면 지금 선택된 씬." }, newName: { type: "string" } }, required: ["sceneNumber", "newName"] } },
  { type: "function", name: "merge_photo_scenes", description: "현재 사진 분류 화면에서 두 씬을 하나로 합칩니다. sceneNumberA를 생략하면 지금 선택된 씬을 사용합니다.", strict: true, parameters: { type: "object", additionalProperties: false, properties: { sceneNumberA: { type: ["number", "null"], description: "1부터 시작하는 씬 번호. 생략하면 지금 선택된 씬." }, sceneNumberB: { type: "number", description: "1부터 시작하는 씬 번호." } }, required: ["sceneNumberA", "sceneNumberB"] } },
  { type: "function", name: "split_photo_scene", description: "현재 사진 분류 화면에서 한 씬을 지정한 사진 위치에서 둘로 나눕니다. sceneNumber를 생략하면 지금 선택된 씬을 사용합니다.", strict: true, parameters: { type: "object", additionalProperties: false, properties: { sceneNumber: { type: ["number", "null"], description: "1부터 시작하는 씬 번호. 생략하면 지금 선택된 씬." }, splitBeforePhotoNumber: { type: "number", description: "이 씬 안에서 몇 번째(1부터) 사진부터 새 씬으로 나눌지." } }, required: ["sceneNumber", "splitBeforePhotoNumber"] } },
  { type: "function", name: "start_ai_photo_classification", description: "지금 열려 있는 사진 분류 화면에서, 이미 선택된 폴더를 AI가 분석해 추천한 기준으로 자동 분류를 실행합니다. 폴더가 아직 선택되지 않았으면 실패합니다.", strict: true, parameters: { type: "object", additionalProperties: false, properties: {}, required: [] } },
  { type: "function", name: "refine_photo_classification", description: "지금 열려 있는 사진 분류 화면의 AI 분류 기준이나 결과를 자연어 요청으로 조정합니다. 예: '같은 장소라도 모델 바뀌면 나눠줘', '너무 잘게 나눴어', '3번 Scene만 더 나눠줘'.", strict: true, parameters: { type: "object", additionalProperties: false, properties: { message: { type: "string", description: "사용자의 자연어 요청 원문." } }, required: ["message"] } },
  { type: "function", name: "client_search", description: "[READ] 등록 고객을 병원명/고객명으로 검색하고 FOUND, NOT_FOUND, AMBIGUOUS를 구분합니다.", strict: true, parameters: { type: "object", additionalProperties: false, properties: { query: { type: "string" } }, required: ["query"] } },
  { type: "function", name: "client_get", description: "[READ] clientId 또는 현재 선택 고객의 상세 정보와 연결된 프로젝트/자료를 조회합니다.", strict: true, parameters: { type: "object", additionalProperties: false, properties: { clientId: { type: ["string", "null"] } }, required: ["clientId"] } },
  { type: "function", name: "client_create", description: "신규 고객 등록 승인 요청입니다. 'OO병원 고객으로 등록해줘', 'OO 고객 등록', '신규 고객 추가' 요청에만 사용합니다. 이 도구 자체는 고객을 생성하지 않고 정확한 고객명과 입력값을 확인한 뒤 승인 카드를 만듭니다. 삭제·제거·취소 요청에는 절대 사용하지 않습니다.", strict: true, parameters: { type: "object", additionalProperties: false, properties: { hospitalName: { type: "string" }, contactName: { type: ["string", "null"] }, phone: { type: ["string", "null"] }, email: { type: ["string", "null"] }, specialty: { type: ["string", "null"] }, memo: { type: ["string", "null"] } }, required: ["hospitalName", "contactName", "phone", "email", "specialty", "memo"] } },
  { type: "function", name: "client_update", description: "[WRITE] clientId 또는 현재 선택 고객의 전달된 필드만 수정하고 재조회 검증합니다.", strict: true, parameters: { type: "object", additionalProperties: false, properties: { clientId: { type: ["string", "null"] }, hospitalName: { type: ["string", "null"] }, contactName: { type: ["string", "null"] }, phone: { type: ["string", "null"] }, email: { type: ["string", "null"] }, specialty: { type: ["string", "null"] }, memo: { type: ["string", "null"] } }, required: ["clientId", "hospitalName", "contactName", "phone", "email", "specialty", "memo"] } },
  { type: "function", name: "client_archive", description: "고객 보관 승인 요청입니다. 일반적인 '고객에서 삭제', '목록에서 빼', '고객등록 취소' 요청에서 정확한 고객을 확인하고 목록에서 숨길지 승인만 요청합니다. 프로젝트와 문서는 그대로 남고 이 도구 자체는 변경하지 않습니다. 완전 삭제 요청은 실행하지 말고 고객관리 화면에서 삭제하도록 안내합니다.", strict: true, parameters: { type: "object", additionalProperties: false, properties: { hospitalName: { type: ["string", "null"] }, clientId: { type: ["string", "null"] } }, required: ["hospitalName", "clientId"] } },
  { type: "function", name: "get_quote", description: "[READ] quoteId 또는 현재 열린 견적서의 canonical 데이터를 조회합니다.", strict: true, parameters: { type: "object", additionalProperties: false, properties: { quoteId: { type: ["string", "null"] } }, required: ["quoteId"] } },
  { type: "function", name: "get_contract", description: "[READ] contractId 또는 현재 열린 계약서의 canonical 데이터를 조회합니다.", strict: true, parameters: { type: "object", additionalProperties: false, properties: { contractId: { type: ["string", "null"] } }, required: ["contractId"] } },
  { type: "function", name: "preview_contract", description: "현재 계약서 canonical resource를 읽어 미리보기를 엽니다.", strict: true, parameters: { type: "object", additionalProperties: false, properties: { contractId: { type: ["string", "null"] } }, required: ["contractId"] } },
  { type: "function", name: "list_photo_storage_projects", description: "[READ] 최근 촬영 프로젝트(사진 스토리지 원격 파이프라인)의 상태를 목록으로 조회합니다.", strict: true, parameters: { type: "object", additionalProperties: false, properties: {}, required: [] } },
  { type: "function", name: "get_photo_storage_status", description: "[READ] 프로젝트 이름 또는 ID로 사진 작업 파이프라인(JPG정리→복사→분류)의 현재 상태·장수·마지막 오류·최근 이벤트를 조회합니다.", strict: true, parameters: { type: "object", additionalProperties: false, properties: { projectId: { type: ["string", "null"] }, projectName: { type: ["string", "null"] } }, required: ["projectId", "projectName"] } },
  { type: "function", name: "retry_photo_storage_project", description: "JPG정리·복사·분류 중 실패했거나(MERGE_FAILED/COPY_FAILED/CLASSIFY_FAILED) 확인이 필요한(REVIEW_REQUIRED) 촬영 프로젝트를 해당 단계부터 다시 시도합니다. 진행이 필요한 단계(READY/MERGE_COMPLETED)는 이 도구로 진행시킬 수 없습니다 — 그 진행은 항상 사용자가 화면에서 직접 눌러야 합니다.", strict: true, parameters: { type: "object", additionalProperties: false, properties: { projectId: { type: "string" } }, required: ["projectId"] } },
  { type: "function", name: "remote_folder_list", description: "[READ] NAS의 지정 경로(비우면 최상위) 폴더/파일 목록을 조회합니다. 읽기 전용이며 파일을 삭제·이동·이름변경하지 않습니다.", strict: true, parameters: { type: "object", additionalProperties: false, properties: { path: { type: ["string", "null"] } }, required: ["path"] } },
  { type: "function", name: "remote_folder_get_info", description: "[READ] NAS 특정 폴더의 하위 폴더/파일 개수와 총 용량을 요약 조회합니다.", strict: true, parameters: { type: "object", additionalProperties: false, properties: { path: { type: "string" } }, required: ["path"] } },
  { type: "function", name: "remote_file_search", description: "[READ] NAS에서 이름이 일치하는 파일/폴더를 하위 폴더까지 찾습니다. 결과가 많으면 상한을 두고 잘라서 반환합니다.", strict: true, parameters: { type: "object", additionalProperties: false, properties: { query: { type: "string" }, basePath: { type: ["string", "null"] } }, required: ["query", "basePath"] } },
  { type: "function", name: "nas_backup_status", description: "[READ] NAS Backup Watcher가 감지한 이벤트를 상태별로 집계해 새로 들어온 백업이 있는지 알려줍니다.", strict: true, parameters: { type: "object", additionalProperties: false, properties: {}, required: [] } },
  { type: "function", name: "nas_backup_recent", description: "[READ] 최근 NAS 백업 감지 이벤트 목록을 조회합니다.", strict: true, parameters: { type: "object", additionalProperties: false, properties: { limit: { type: ["number", "null"] } }, required: ["limit"] } },
  { type: "function", name: "nas_backup_get", description: "[READ] id로 NAS 백업 감지 이벤트 하나를 상세 조회합니다.", strict: true, parameters: { type: "object", additionalProperties: false, properties: { id: { type: "string" } }, required: ["id"] } },
  { type: "function", name: "find_photo_folder", description: "[READ] 사진 작업용 Workstation 촬영 폴더를 부분 이름으로 찾고 장수·용량·수정일·현재 처리 상태를 반환합니다. JPG정리·연출정리·프로필정리·인테리어정리·전체 분류의 첫 단계로 사용합니다. 후보가 여러 개면 반드시 어느 폴더인지 물어보세요.", strict: true, parameters: { type: "object", additionalProperties: false, properties: { query: { type: "string", description: "작업 요청을 제외한 NAS 촬영 폴더 이름만" } }, required: ["query"] } },
  { type: "function", name: "start_photo_source_prep", description: "[WRITE] JPG정리 요청에 사용합니다. RAW는 원래 자리에 그대로 두고 JPG/JPEG만 JPG전체로 준비합니다. 중간에 끊겼으면 없는 파일만 이어서 처리합니다.", strict: true, parameters: { type: "object", additionalProperties: false, properties: { folderName: { type: "string" }, confirmRestart: { type: "boolean" } }, required: ["folderName", "confirmRestart"] } },
  { type: "function", name: "start_photo_scene_sort", description: "[WRITE] 전체 분류·연출정리·프로필정리·인테리어정리에 사용합니다. 전체 분류는 JPG정리부터 자동으로 이어 가며, 진료과는 폴더/고객 정보에서, 현장·스튜디오 구분은 사진별로 자동 판정합니다.", strict: true, parameters: { type: "object", additionalProperties: false, properties: { folderName: { type: "string" }, only: { type: "string", enum: ["all", "연출", "프로필", "인테리어"] }, confirmRestart: { type: "boolean" } }, required: ["folderName", "only", "confirmRestart"] } },
  { type: "function", name: "nas_backup_start_sort", description: "[WRITE] NAS 감지 알림의 전체 분류 또는 유형별 정리를 시작합니다. JPG정리·Agentstation 복사·사진별 자동 판정을 같은 상태 전이로 이어 갑니다.", strict: true, parameters: { type: "object", additionalProperties: false, properties: { folderName: { type: "string" }, only: { type: "string", enum: ["all", "연출", "프로필", "인테리어"] }, eventId: { type: ["string", "null"] }, confirmRestart: { type: "boolean" } }, required: ["folderName", "only", "eventId", "confirmRestart"] } },
  { type: "function", name: "start_photo_raw_match", description: "[WRITE] 정확히 선택된 촬영 프로젝트에서 최신 고객 셀렉 제출본을 우선 사용하고, 없으면 XMP 별점 1 이상만 사용해 Mac Studio RAW 매칭 작업을 주문합니다. 둘 다 없으면 전체 사진을 임의 매칭하지 않고 중단합니다.", strict: true, parameters: { type: "object", additionalProperties: false, properties: { folderName: { type: "string" }, galleryId: { type: ["string", "null"] }, confirmRestart: { type: "boolean" } }, required: ["folderName", "galleryId", "confirmRestart"] } },
  { type: "function", name: "start_photo_resize", description: "[WRITE] SSD2 씬별분류 JPG를 원본 보존 상태로 Mac Studio에서 리사이즈합니다. 크기·품질을 말하지 않으면 기존 기본값 4000px/Q95를 사용하고 응답에 알려줍니다.", strict: true, parameters: { type: "object", additionalProperties: false, properties: { folderName: { type: "string" }, inputRelativePath: { type: ["string", "null"] }, longEdge: { type: ["number", "null"] }, quality: { type: ["number", "null"] }, confirmRestart: { type: "boolean" } }, required: ["folderName", "inputRelativePath", "longEdge", "quality", "confirmRestart"] } },
  { type: "function", name: "start_photo_ai_select", description: "[WRITE] SSD2 씬별분류를 기존 사진작업실 품질·중복 기준으로 분석해 선택 manifest를 만드는 Mac Studio 작업을 주문합니다. 원본 사진을 이동하거나 삭제하지 않습니다.", strict: true, parameters: { type: "object", additionalProperties: false, properties: { folderName: { type: "string" }, inputRelativePath: { type: ["string", "null"] }, confirmRestart: { type: "boolean" } }, required: ["folderName", "inputRelativePath", "confirmRestart"] } },
  { type: "function", name: "start_photo_retouch", description: "[WRITE] 사용자가 명시한 1~10개 JPG를 기존 사진작업실 피부/가운 컬러 검사로 분석해 보정 가이드를 만듭니다. 실제 픽셀은 수정하지 않으며 파일명이 없으면 반드시 되묻습니다.", strict: true, parameters: { type: "object", additionalProperties: false, properties: { folderName: { type: "string" }, fileNames: { type: "array", minItems: 1, maxItems: 10, items: { type: "string" } }, checkType: { type: "string", enum: ["skin", "gown"] }, confirmRestart: { type: "boolean" } }, required: ["folderName", "fileNames", "checkType", "confirmRestart"] } },
];

// ── Tool Router (구조 개편 2026-08-31) ────────────────────────────────────────────────
// 예전엔 이 파일 하나에 도메인 60여 개 분기가 전부 있었다 — 이제 각 domain executor
// (lib/olivia/v2/toolExecutors/*.ts)가 자기 tool 이름 목록과 실행 함수를 갖고, 여기서는
// 이름→executor 연결만 한다. 실행 순서·동작은 그대로다(같은 코드를 옮겼을 뿐이다).
type ToolHandler = (name: string, input: Record<string, unknown>, context: OliviaContextSnapshot) => Promise<OliviaToolResult>;

const DOMAIN_EXECUTORS: ReadonlyArray<readonly [ReadonlyArray<string>, ToolHandler]> = [
  [QUOTE_TOOL_NAMES, executeQuoteTool],
  [CONTRACT_TOOL_NAMES, executeContractTool],
  [CALENDAR_TOOL_NAMES, executeCalendarTool],
  [WORKFLOW_TOOL_NAMES, executeWorkflowTool],
  [CLIENT_TOOL_NAMES, executeClientTool],
  [DOCUMENT_TOOL_NAMES, executeDocumentTool],
  [MEMORY_TOOL_NAMES, executeMemoryTool],
  [PHOTO_CLASSIFICATION_TOOL_NAMES, executePhotoClassificationTool],
  [PHOTO_STORAGE_TOOL_NAMES, executePhotoStorageTool],
  [COMMON_TOOL_NAMES, executeCommonTool],
  [REMOTE_FINDER_TOOL_NAMES, executeRemoteFinderTool],
  [NAS_BACKUP_TOOL_NAMES, executeNasBackupTool],
  [PHOTO_OPERATION_TOOL_NAMES, executePhotoOperationTool],
  [GALLERY_TOOL_NAMES, executeGalleryTool],
];

const TOOL_ROUTER = new Map<string, ToolHandler>();
for (const [names, handler] of DOMAIN_EXECUTORS) {
  for (const toolName of names) TOOL_ROUTER.set(toolName, handler);
}

export async function runTool(
  name: string,
  input: Record<string, unknown>,
  context: OliviaContextSnapshot,
): Promise<OliviaToolResult> {
  const handler = TOOL_ROUTER.get(name);
  if (!handler) throw new Error("지원하지 않는 Olivia 작업이에요.");
  return handler(name, input, context);
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

  const intentGuard = validateMutationIntent({
    requestText: context.currentRequestText,
    toolName: toolCall.name,
  });
  if (!intentGuard.allowed) {
    return {
      result: {
        tool: toolCall.name,
        success: false,
        code: intentGuard.code,
        error: intentGuard.reason,
        verification: { executed: false },
      },
      uiActions: [],
    };
  }

  try {
    const result = await runTool(toolCall.name, input, context);
    const uiActions = await resolveUiActions({ toolCall, input, result, context });
    // 서버가 실제 client UI 반영 여부까지는 확인할 수 없다(스펙 §17) — ui_action을 만들어
    // 냈다는 사실만 details에 남기고, uiUpdated를 함부로 true로 단정하지 않는다.
    if (uiActions.length && result.verification) {
      result.verification = mergeVerification(result.verification, { details: { uiActionEmitted: true } });
    }
    return { result, uiActions };
  } catch (error) {
    const normalized = normalizeToolError(error);
    console.error("[olivia-v2] tool execution failed", toolCall.name, normalized.logDetail);
    return {
      result: {
        tool: toolCall.name,
        success: false,
        error: normalized.userMessage,
        ...(error instanceof OliviaToolError ? { code: error.code, details: error.details } : {}),
        verification: mergeVerification(undefined, { executed: false }),
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
