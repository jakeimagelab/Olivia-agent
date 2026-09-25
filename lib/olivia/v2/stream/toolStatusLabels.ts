// PHASE 4 작업 5(2026-09-25) — app/api/olivia/v2/stream/route.ts에서 그대로 옮겼다. 동작 변경 없음.
export function toolStatus(name: string) {
  if (name === "find_photo_folder") return "Workstation 촬영 폴더를 찾는 중…";
  if (name === "start_photo_source_prep") return "RAW는 그대로 두고 JPG 통합 작업을 주문하는 중…";
  if (name === "start_photo_scene_sort") return "JPG 통합·복사·Scene 분류 작업을 주문하는 중…";
  if (name === "select_project") return "고객과 프로젝트를 확인하는 중…";
  if (name === "create_quote") return "견적 초안을 생성하는 중…";
  if (name === "create_contract") return "계약서 초안을 생성하는 중…";
  if (name === "create_conti") return "콘티 초안을 생성하는 중…";
  if (name === "get_conti_status") return "저장된 콘티를 확인하는 중…";
  if (name === "update_quote_item") return "견적을 수정하는 중…";
  if (["add_quote_item", "remove_quote_item", "update_quote_note", "update_quote_info", "apply_quote_discount", "update_quote_vat_mode"].includes(name)) return "견적을 수정하는 중…";
  if (name === "rebalance_quote_total") return "견적 조정안을 계산하는 중…";
  if (name === "update_contract_terms") return "계약 조건을 수정하는 중…";
  if (name === "request_contract_signature") return "서명 패드를 준비하는 중…";
  if (name === "complete_contract") return "계약서를 내부 최종완료하는 중…";
  if (name === "request_contract_publish") return "계약서 포털 공개 승인을 준비하는 중…";
  if (name === "publish_contract") return "계약서를 고객 포털에 공개하는 중…";
  if (name === "download_contract_pdf") return "계약서 PDF를 준비하는 중…";
  if (["rename_photo_scene", "merge_photo_scenes", "split_photo_scene"].includes(name)) return "사진 씬을 정리하는 중…";
  if (name === "add_conti_shots") return "콘티 컷을 구성하는 중…";
  if (["update_conti_shot", "remove_conti_shot", "reorder_conti_shot", "duplicate_conti_shot"].includes(name)) return "콘티를 수정하는 중…";
  if (name === "complete_conti_v2") return "콘티를 내부 최종완료하는 중…";
  if (name === "open_feature") return "화면을 찾는 중…";
  if (name === "maximize_active_window" || name === "minimize_active_window" || name === "close_active_window") return "창을 정리하는 중…";
  if (name === "search_documents" || name === "get_recent_documents") return "저장된 문서를 찾는 중…";
  if (name === "open_document") return "문서를 여는 중…";
  if (name === "list_workflow_step_tasks") return "업무 프로세스를 확인하는 중…";
  if (name === "process_workflow_step") return "현재 단계 업무를 처리하는 중…";
  if (name === "approve_workflow_task") return "업무를 처리하는 중…";
  if (name === "link_document_to_client") return "고객에 연결하는 중…";
  if (name === "create_feature_record") return "데이터를 생성하는 중…";
  if (name === "update_feature_record") return "데이터를 수정하는 중…";
  if (name === "save_agent_memory" || name === "update_agent_memory") return "업무 규칙을 기억하는 중…";
  if (name === "disable_agent_memory") return "업무 규칙을 정리하는 중…";
  if (name === "list_agent_memories") return "기억하고 있는 규칙을 확인하는 중…";
  const normalized = name.replaceAll(".", "_");
  if (normalized.startsWith("client_")) return "고객 정보를 처리하는 중…";
  if (normalized.startsWith("quote_") || normalized.includes("_quote")) return "견적서를 처리하는 중…";
  if (normalized.startsWith("contract_") || normalized.includes("_contract")) return "계약서를 처리하는 중…";
  if (normalized.startsWith("conti_") || normalized.includes("_conti")) return "콘티를 처리하는 중…";
  if (normalized.startsWith("calendar_")) return "일정을 처리하는 중…";
  if (normalized.startsWith("work_")) return "오늘 업무를 처리하는 중…";
  if (normalized.startsWith("memo_")) return "메모를 처리하는 중…";
  if (normalized.startsWith("workflow_")) return "업무 흐름을 확인하는 중…";
  if (normalized.includes("analysis")) return "분석을 처리하는 중…";
  if (normalized.startsWith("document_") || normalized.startsWith("gallery_")) return "자료를 확인하는 중…";
  if (normalized.startsWith("ui_")) return "화면을 준비하는 중…";
  // PHASE 4 작업 2(2026-09-25) R2 — 매핑에 없는 도구를 "요청을 처리하는 중…"처럼 뭉뚱그리지
  // 않는다. 뭘 하는지 모르는 게 제일 답답하다는 게 이 작업의 명시적 요구사항이라, 못 찾은
  // 도구는 이름을 그대로 노출한다.
  return `${name} 처리하는 중…`;
}
