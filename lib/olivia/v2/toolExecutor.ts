import type { FunctionTool } from "openai/resources/responses/responses";
import { getOliviaCrudCapabilities } from "@/lib/olivia/crud/registry";
import { resolveUiActions } from "@/lib/olivia/agent/uiActionResolvers";
import type {
  OliviaAgentToolExecution,
  OliviaContextSnapshot,
  OliviaToolCall,
  OliviaToolResult,
} from "@/lib/olivia/v2/types";
import { OLIVIA_MEMORY_TYPES } from "@/lib/olivia/memory/types";
import { normalizeToolError, OLIVIA_FALLBACK_MESSAGES } from "@/lib/olivia/output/errorMessages";
import { mergeVerification } from "./toolExecutors/verification";
import { OPEN_FEATURE_RECORD_DOMAINS, FEATURE_RECORD_TOOL_NAMES, executeFeatureRecordTool } from "./toolExecutors/featureRecord";
import { QUOTE_TOOL_NAMES, executeQuoteTool } from "./toolExecutors/quote";
import { CONTRACT_TOOL_NAMES, executeContractTool } from "./toolExecutors/contract";
import { CONTI_TOOL_NAMES, executeContiTool } from "./toolExecutors/conti";
import { CALENDAR_TOOL_NAMES, executeCalendarTool } from "./toolExecutors/calendar";
import { WORKFLOW_TOOL_NAMES, executeWorkflowTool } from "./toolExecutors/workflow";
import { MAILING_TOOL_NAMES, executeMailingTool } from "./toolExecutors/mailing";
import { GALLERY_TOOL_NAMES, executeGalleryTool } from "./toolExecutors/gallery";
import { CLIENT_TOOL_NAMES, executeClientTool } from "./toolExecutors/client";
import { DOCUMENT_TOOL_NAMES, executeDocumentTool } from "./toolExecutors/document";
import { MEMORY_TOOL_NAMES, executeMemoryTool } from "./toolExecutors/memory";
import { TASK_SESSION_TOOL_NAMES, executeTaskSessionTool } from "./toolExecutors/taskSession";
import { PHOTO_CLASSIFICATION_TOOL_NAMES, executePhotoClassificationTool } from "./toolExecutors/photoClassification";
import { COMMON_TOOL_NAMES, executeCommonTool } from "./toolExecutors/common";

// 코드 요청서(2026-08-15) 3번 항목 — CRUD 엔진(lib/olivia/crud)은 12개 도메인을 지원하지만
// 챗 도구로는 quote/contract/conti 3개만 노출돼 있었다. client/workflow는 위험도가 높아
// (고객 원장 정보 직접 변경, 단계 강제 이동) 4번 항목(승인 게이트)이 실제로 막는 걸 확인한 뒤
// 2차로 열기로 하고, 1차는 나머지 7개 도메인만 연다.
// (OPEN_FEATURE_RECORD_DOMAINS 자체는 toolExecutors/featureRecord.ts가 소유한다 — 실행 로직과
// tool definition 둘 다 같은 값을 써야 해서 여기서는 재수출만 받는다. 중복 정의 금지.)

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
  { type: "function", name: "start_quote_wizard", description: "[WRITE 아님] 사용자가 새 견적서를 시작하고 싶어하는데(예: \"견적서 만들자\", \"견적서 만들어줘\", \"견적서 화면 열어줘\") 브랜드가 아직 대화에서 확인되지 않았거나 요청이 막연할 때 씁니다. 브랜드+병원명 등 충분한 정보가 이미 한 메시지에 있으면 이 도구 대신 곧장 create_quote를 씁니다. \"OO클리닉 견적서 열어줘\"/\"지난 견적 보여줘\"처럼 기존 문서를 가리키는 요청에는 절대 쓰지 않습니다(search_documents/open_document를 씁니다). 파라미터는 없습니다 — 호출하면 채팅에 브랜드 선택 카드가 뜨고 이후 단계는 사용자가 카드에서 직접 진행합니다.", strict: true, parameters: { type: "object", additionalProperties: false, properties: {}, required: [] } },
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
  { type: "function", name: "resolve_quote_client", description: "[READ] 견적서에 아직 고객이 연결되어 있지 않으면, 견적서의 병원명으로 등록된 고객을 찾아봅니다. 견적서를 최종 승인한 직후 \"OO을 고객으로 등록할까요?\"라고 물어보기 전에 씁니다. quoteId를 비우면 지금 열려 있는 견적서를 씁니다.", strict: true, parameters: { type: "object", additionalProperties: false, properties: { quoteId: { type: ["string", "null"] } }, required: ["quoteId"] } },
  { type: "function", name: "link_new_client_to_quote", description: "[WRITE] resolve_quote_client로 확인한 후보를 이 견적서에 연결합니다. clientId를 채우면 이미 있는 고객에 연결하고, 비우면(hospitalName으로) 새 고객을 등록한 뒤 연결합니다.", strict: true, parameters: { type: "object", additionalProperties: false, properties: { resourceId: { type: "string" }, clientId: { type: ["string", "null"] }, hospitalName: { type: ["string", "null"] }, contactName: { type: ["string", "null"] }, phone: { type: ["string", "null"] }, email: { type: ["string", "null"] } }, required: ["resourceId", "clientId", "hospitalName", "contactName", "phone", "email"] } },
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
    description: "현재 고객과 프로젝트를 유지하면서 견적서·계약서·콘티·사진 작업실 Workspace를 엽니다.",
    strict: true,
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: { workspace: { type: "string", enum: ["quote", "contract", "conti", "photo-sort"] } },
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
  { type: "function", name: "search_documents", description: "[READ] 견적서/계약서/콘티/상담메모/갤러리 등 Olivia에 저장된 문서를 자연어로 찾습니다. \"지난/이전/저번/최근 견적(콘티/계약) 보여줘\", \"OO 견적 찾아줘\", \"OO클리닉 견적서 열어줘\"처럼 기존 문서를 가리키는 요청은 전부 이 도구를 먼저 쓴다 — 못 찾았다고 스스로 추측해서 답하지 않는다. \"견적서 만들자\"처럼 새로 만드는 요청에는 절대 쓰지 않는다(start_quote_wizard/create_quote를 쓴다). clientName을 알면 반드시 채워 그 고객 범위로 좁히고, 모르면 null로 둔다.", strict: true, parameters: { type: "object", additionalProperties: false, properties: { query: { type: ["string", "null"], description: "고객명/문서 종류를 뺀 나머지 검색어. \"지난\"/\"최근\"/\"저번\" 같은 시점 표현은 넣지 않는다 — 검색은 항상 최신순으로 정렬된다." }, clientName: { type: ["string", "null"] }, documentType: { type: ["string", "null"], description: "\"콘티\"/\"견적\"/\"계약\"/\"메모\"/\"갤러리\"처럼 사용자가 말한 단어 그대로 넣는다 — 코드가 내부적으로 정규화한다." }, limit: { type: ["number", "null"] } }, required: ["query", "clientName", "documentType", "limit"] } },
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
  // AI 사진 분류 2.0(스펙 §35/36) — 지금 열려 있는 사진 분류 화면에 이미 폴더가 선택돼 있을 때만
  // 의미가 있다(폴더 선택창은 사용자 클릭 없이 열 수 없음). start는 그 폴더를 AI가 분석해 추천한
  // 기준으로 바로 분류를 실행하고, refine은 자연어로 이미 나온 분류 기준/결과를 조정한다.
  { type: "function", name: "start_ai_photo_classification", description: "지금 열려 있는 사진 분류 화면에서, 이미 선택된 폴더를 AI가 분석해 추천한 기준으로 자동 분류를 실행합니다. 폴더가 아직 선택되지 않았으면 실패합니다.", strict: true, parameters: { type: "object", additionalProperties: false, properties: {}, required: [] } },
  { type: "function", name: "refine_photo_classification", description: "지금 열려 있는 사진 분류 화면의 AI 분류 기준이나 결과를 자연어 요청으로 조정합니다. 예: '같은 장소라도 모델 바뀌면 나눠줘', '너무 잘게 나눴어', '3번 Scene만 더 나눠줘'.", strict: true, parameters: { type: "object", additionalProperties: false, properties: { message: { type: "string", description: "사용자의 자연어 요청 원문." } }, required: ["message"] } },
];

// ── Tool Router (구조 개편 2026-08-31) ────────────────────────────────────────────────
// 예전엔 이 파일 하나에 도메인 60여 개 분기가 전부 있었다 — 이제 각 domain executor
// (lib/olivia/v2/toolExecutors/*.ts)가 자기 tool 이름 목록과 실행 함수를 갖고, 여기서는
// 이름→executor 연결만 한다. 실행 순서·동작은 그대로다(같은 코드를 옮겼을 뿐이다).
type ToolHandler = (name: string, input: Record<string, unknown>, context: OliviaContextSnapshot) => Promise<OliviaToolResult>;

const DOMAIN_EXECUTORS: ReadonlyArray<readonly [ReadonlyArray<string>, ToolHandler]> = [
  [QUOTE_TOOL_NAMES, executeQuoteTool],
  [CONTRACT_TOOL_NAMES, executeContractTool],
  [CONTI_TOOL_NAMES, executeContiTool],
  [CALENDAR_TOOL_NAMES, executeCalendarTool],
  [WORKFLOW_TOOL_NAMES, executeWorkflowTool],
  [MAILING_TOOL_NAMES, executeMailingTool],
  [GALLERY_TOOL_NAMES, executeGalleryTool],
  [CLIENT_TOOL_NAMES, executeClientTool],
  [DOCUMENT_TOOL_NAMES, executeDocumentTool],
  [MEMORY_TOOL_NAMES, executeMemoryTool],
  [TASK_SESSION_TOOL_NAMES, executeTaskSessionTool],
  [FEATURE_RECORD_TOOL_NAMES, executeFeatureRecordTool],
  [PHOTO_CLASSIFICATION_TOOL_NAMES, executePhotoClassificationTool],
  [COMMON_TOOL_NAMES, executeCommonTool],
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
