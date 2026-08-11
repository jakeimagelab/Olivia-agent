import type { OliviaChatAttachment } from "@/lib/olivia/chatAttachments";
import type { OliviaChatWorkItem } from "@/lib/olivia/chatTypes";

// components/OliviaChat.tsx(플로팅 위젯)와 components/home/OliviaHeroChat.tsx(홈 임베드 채팅)가
// 공유하는 /api/olivia 프로토콜 관련 타입·상수·순수 함수 — 두 컴포넌트가 같은 대화 스레드와 같은
// 도구 승인/자동실행 규칙을 쓰기 때문에, 여기서 한 곳에만 정의해서 서로 어긋나지 않게 한다.

export interface OliviaMessage {
  id?: string;
  clientRequestId?: string;
  createdAt?: string;
  role: "user" | "assistant";
  content: string;
  source?: "web" | "telegram";
  toolRequest?: { name: string; input: any; id: string; label: string };
  toolResult?: string;
  isApproved?: boolean;
  workItems?: OliviaChatWorkItem[];
  attachments?: OliviaChatAttachment[];
}

export const TOOL_LABELS: Record<string, string> = {
  create_quote:        "견적서 생성",
  create_contract:     "계약서 생성",
  send_file_transfer:  "파일 전송 메일 발송",
  create_conti:        "촬영 콘티 생성",
  open_page:           "페이지 이동",
  calendar_add:        "캘린더 일정 추가",
  calendar_add_bulk:   "캘린더 일정 일괄 추가",
  calendar_list:       "캘린더 일정 조회",
  calendar_complete:   "일정 완료 처리",
  calendar_delete:     "일정 삭제",
  calendar_update:     "일정 수정",
  get_today_briefing:  "오늘의 업무 확인",
  get_urgent_insights: "긴급 인사이트 확인",
  search_client_projects: "고객·프로젝트 검색",
  get_project_status:  "프로젝트 현황 확인",
  list_pending_approvals: "승인 대기 확인",
  list_commitments:    "약속 확인",
  prepare_followup:    "고객 후속 연락 준비",
  manage_olivia_action:"Olivia 업무 처리",
  run_observer:        "최신 업무 재점검",
  list_upcoming_meetings: "예정 고객 미팅 확인",
  link_meeting_client: "미팅 고객 연결",
  prepare_meeting_brief: "미팅 전 브리핑 준비",
  analyze_meeting_memo: "미팅 메모 분석",
  complete_meeting: "미팅 완료 처리",
  get_meeting_followups: "미팅 후속 업무 확인",
  create_feature_record: "기능 데이터 생성",
  update_feature_record: "기능 데이터 수정",
  generate_review_content: "리뷰 콘텐츠 이미지 생성",
};

export const TOOL_ICONS: Record<string, string> = {
  create_quote:        "📋",
  create_contract:     "📝",
  send_file_transfer:  "📨",
  create_conti:        "🎬",
  open_page:           "🔗",
  calendar_add:        "📅",
  calendar_add_bulk:   "📅",
  calendar_list:       "🗓️",
  calendar_complete:   "✅",
  calendar_delete:     "🗑️",
  calendar_update:     "✏️",
  get_today_briefing:  "☀️",
  get_urgent_insights: "🚨",
  search_client_projects: "🔎",
  get_project_status:  "📍",
  list_pending_approvals: "✅",
  list_commitments:    "🤝",
  prepare_followup:    "✉️",
  manage_olivia_action:"⚡",
  run_observer:        "✨",
  list_upcoming_meetings: "🗓️",
  link_meeting_client: "🔗",
  prepare_meeting_brief: "📋",
  analyze_meeting_memo: "🎙️",
  complete_meeting: "✅",
  get_meeting_followups: "🤝",
  create_feature_record: "＋",
  update_feature_record: "✎",
  generate_review_content: "✨",
};

// 페이지 이동만 하거나(DB 기록 없음), 조회이거나, 내부 상태 변경인 도구는 승인 없이 자동 실행.
// 고객에게 실제 이메일이 나가는 send_file_transfer/send_workflow_mail/send_mailing은 되돌릴 수
// 없는 행동이라 승인 카드로 남겨둔다.
export const AUTO_EXECUTE_TOOLS = new Set([
  "calendar_add", "calendar_add_bulk", "calendar_list",
  "calendar_complete", "calendar_delete", "calendar_update", "open_page",
  "get_today_briefing", "get_urgent_insights", "search_client_projects",
  "get_project_status", "list_pending_approvals", "list_commitments",
  "prepare_followup", "run_observer",
  "list_upcoming_meetings", "prepare_meeting_brief",
  "analyze_meeting_memo", "complete_meeting", "get_meeting_followups",
  "create_quote", "create_contract", "create_website", "create_conti",
  "get_workflow_status", "advance_workflow_step",
  "get_gallery", "create_gallery", "list_mailing_queue",
  "memo_add", "manage_olivia_action", "link_meeting_client",
  "check_recent_errors", "generate_document", "generate_dev_request",
  "generate_review_content",
]);

const CRUD_FIELD_LABELS: Record<string, string> = {
  hospitalName: "고객", clientName: "고객", projectName: "프로젝트", title: "제목",
  contactName: "담당자", phone: "전화", email: "이메일", specialty: "진료과",
  date: "날짜", time: "시간", shootDate: "촬영일", quoteNumber: "견적번호",
  totalAmount: "합계", nasLink: "NAS", subject: "메일 제목", status: "상태",
};

function summarizeCrudData(input: any) {
  const prefix = input.target?.name || input.target?.naturalKey || input.target?.id;
  const fields = Object.entries(input.data || {}).slice(0, 5).map(([key, value]) => {
    const printable = typeof value === "object" ? JSON.stringify(value) : String(value);
    return `${CRUD_FIELD_LABELS[key] || key}: ${printable.slice(0, 48)}`;
  });
  return [`${input.domain || "기능"}${prefix ? ` · 대상: ${prefix}` : ""}`, ...fields].join("\n");
}

// 도구 입력 요약
export function summarizeTool(name: string, input: any): string {
  switch (name) {
    case "create_feature_record":
      return summarizeCrudData(input);
    case "update_feature_record":
      return summarizeCrudData(input);
    case "create_quote":
      return `${input.hospitalName || ""}${input.packageId ? " · " + input.packageId : ""}`;
    case "send_file_transfer":
      return `${input.hospitalName || ""} → ${input.toEmail || ""}`;
    case "create_contract":
      return `${input.hospitalName || ""} · ${input.totalAmount ? input.totalAmount.toLocaleString("ko-KR") + "원" : ""}`;
    case "create_conti":
      return `${input.hospitalName || ""} · ${input.dept || ""} · ${input.shootDate || ""}`;
    case "open_page":
      return `/${input.page}`;
    default:
      return JSON.stringify(input).slice(0, 60);
  }
}

export function dispatchOliviaDataChanged(result: any) {
  if (!result?.domain || !result?.operation || !result?.recordId) return;
  window.dispatchEvent(new CustomEvent("olivia-data-changed", {
    detail: { domain: result.domain, operation: result.operation, recordId: result.recordId },
  }));
}
