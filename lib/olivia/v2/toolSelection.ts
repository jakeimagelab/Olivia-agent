import type { FunctionTool } from "openai/resources/responses/responses";
import { OLIVIA_V2_TOOLS } from "./toolExecutor";
import type { OliviaContextSnapshot } from "./types";
import type { OliviaRequestClass } from "./modelRouter";

type ToolDomain = "navigation"|"calendar"|"client"|"quote"|"contract"|"conti"|"workflow"|"mailing"|"gallery"|"meeting"|"content"|"agent_run"|"photo_classification";

const DOMAIN_TOOLS: Record<ToolDomain, readonly string[]> = {
  navigation: ["open_feature","show_workspace"],
  calendar: ["calendar_list","calendar_list_month","calendar_availability","calendar_add","calendar_add_bulk","calendar_update","calendar_complete","calendar_delete"],
  client: ["select_project","search_client_projects","get_project_status","memo_add"],
  quote: ["create_quote","update_quote_item","add_quote_item","remove_quote_item","update_quote_note","update_quote_info","apply_quote_discount","update_quote_vat_mode","rebalance_quote_total","preview_quote","request_quote_publish"],
  contract: ["create_contract","update_contract_terms","request_contract_signature","request_contract_publish","download_contract_pdf","link_document_to_client"],
  conti: ["get_conti_status","create_conti","add_conti_shots","update_conti_shot","remove_conti_shot","reorder_conti_shot","duplicate_conti_shot","estimate_conti_duration","generate_shoot_prep_from_conti","link_document_to_client"],
  workflow: ["get_workflow_status","list_active_workflows","list_workflow_step_tasks","process_workflow_step","approve_workflow_task","advance_workflow_step","complete_workflow_retroactively"],
  mailing: ["list_mailing_queue","send_mailing","email_search","email_read","email_summarize","email_create_draft"],
  // start_select_match_flow가 빠져 있으면 "셀렉"/"사진" 키워드로 gallery 도메인이 잡혀도 모델이
  // 이 도구를 아예 선택지로 못 받아서 항상 open_feature(페이지 이동)로 새는 사고가 났다
  // (2026-08-29 사용자 리포트: "셀렉매칭 하자"가 기능 페이지로 이동해버림).
  gallery: ["get_gallery","create_gallery","start_select_match_flow"],
  meeting: ["list_upcoming_meetings","prepare_meeting_brief","analyze_meeting_memo","complete_meeting","get_meeting_followups","link_meeting_client"],
  content: ["get_today_briefing","get_urgent_insights","run_brand_diagnosis","create_feature_record","update_feature_record"],
  agent_run: ["start_task_session","get_task_session_status","continue_task_session","pause_task_session","get_today_briefing","get_urgent_insights"],
  // 사진 분류 시작(select_match와 동일하게 결정론적 RUN으로 처리, GPT 미거침)은 여기 없다 —
  // 씬 편집(이름변경/합치기/나누기)만 자연어 파라미터 추출이 필요해 GPT를 거친다(PHASE 4,
  // 2026-08-30).
  photo_classification: ["rename_photo_scene","merge_photo_scenes","split_photo_scene"],
};

const DOMAIN_PATTERNS: Array<[ToolDomain, RegExp]> = [
  ["calendar",/(일정|캘린더|스케줄|오늘\s*할\s*일)/i], ["quote",/(견적|단가|금액|할인|부가세|vat)/i],
  ["contract",/(계약)/i], ["conti",/(콘티|스토리보드|컷|촬영\s*시간|촬영\s*준비물)/i],
  ["workflow",/(워크플로|단계|프로세스|진행\s*상태|체크리스트)/i], ["mailing",/(메일|이메일|발송|답장)/i],
  ["gallery",/(갤러리|사진|셀렉)/i], ["meeting",/(미팅|회의|상담)/i],
  ["content",/(브리핑|인사이트|진단|분석|콘텐츠|보고서)/i],
  ["agent_run",/(준비해|준비하자|계속하자|어디까지|보류|끝까지|알아서\s*처리)/i],
  ["client",/(고객|병원|의원|프로젝트)/i], ["navigation",/(열어|보여줘|이동|화면|페이지)/i],
  ["photo_classification",/(씬)/i],
];

const SAFE_FALLBACK = new Set(["open_feature","select_project","search_client_projects","get_project_status","get_workflow_status","list_active_workflows","calendar_list","get_today_briefing","get_urgent_insights"]);

// recentText(직전 사용자 메시지 몇 개)를 message와 함께 봐야 "해줘"/"그냥해"처럼 키워드 없는
// 짧은 후속 확인 메시지에서도 방금 전 주제(예: 견적)의 도구가 목록에서 안 빠진다 — 안 그러면
// 모델이 그 도구를 호출 못 해놓고 "이 대화에는 연결이 안 돼 있다"고 지어내는 사고가 난다.
export function getOliviaToolDomains(message:string, context:OliviaContextSnapshot, recentText?:string):ToolDomain[]{
  const combined = recentText ? `${recentText} ${message}` : message;
  const domains=new Set<ToolDomain>();
  for(const [domain,pattern] of DOMAIN_PATTERNS) if(pattern.test(combined)) domains.add(domain);
  const workspace=String(context.activeWorkspace||"").toLowerCase();
  if(workspace.includes("quote")) domains.add("quote");
  if(workspace.includes("conti")) domains.add("conti");
  if(workspace.includes("contract")) domains.add("contract");
  return [...domains];
}

export function selectOliviaTools(input:{requestClass:OliviaRequestClass;message:string;context:OliviaContextSnapshot;tools?:FunctionTool[];recentText?:string}){
  const tools=input.tools??OLIVIA_V2_TOOLS;
  const domains=getOliviaToolDomains(input.message,input.context,input.recentText);
  const names=new Set<string>();
  for(const domain of domains) for(const name of DOMAIN_TOOLS[domain]) names.add(name);
  if(!names.size || input.requestClass==="NORMAL_CHAT") for(const name of SAFE_FALLBACK) names.add(name);
  names.add("open_feature");
  names.add("select_project");
  // Adaptive Memory 도구는 어느 도메인 turn에서든 "앞으로 이렇게 해" 같은 가르침이 나올 수
  // 있어서 무조건 포함한다 — 도메인 매칭이 안 되는 turn에서 조용히 빠지면 방금 고친 것과
  // 같은 종류의 "도구가 안 보여서 모델이 지어내는" 사고로 이어진다.
  names.add("save_agent_memory");
  names.add("update_agent_memory");
  names.add("disable_agent_memory");
  names.add("list_agent_memories");
  // 도메인 2개만 겹쳐도(예: 견적(10개)+고객(4개)) 15개에 바로 닿는다 — 그 이상 넘치면 어떤
  // 도구가 조용히 빠졌는지 모델도 사용자도 알 방법이 없어서, 정작 필요한 도구(예: create_quote)가
  // 빠진 채로 "그 기능은 연결 안 돼 있다"고 지어내는 사고로 이어졌다(2026-08-24). 전체 도구
  // 개수(69개)보다는 훨씬 좁히되, 흔한 2~3개 도메인 조합은 다 담기게 여유를 둔다.
  return tools.filter((tool)=>names.has(tool.name)).slice(0,28);
}

export function isReadOnlyOliviaTool(toolName:string, tools:FunctionTool[]=OLIVIA_V2_TOOLS){
  const tool=tools.find((candidate)=>candidate.name===toolName);
  return Boolean(tool?.description?.startsWith("[READ]")) || ["get_conti_status","preview_quote","estimate_conti_duration","generate_shoot_prep_from_conti"].includes(toolName);
}
