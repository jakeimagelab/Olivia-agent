import type { OliviaMemoryRow } from "./types";

// 시스템 프롬프트에 주입할 형태 — 모델이 읽을 것이므로 JSON을 그대로 줘도 된다(정밀함 우선).
export function formatMemoryForPrompt(memory: OliviaMemoryRow): string {
  const scopeLabel = memory.scope ? `scope=${memory.scope}` : "scope=전체";
  return `- [${scopeLabel}, type=${memory.memory_type}] ${memory.key}: ${JSON.stringify(memory.value)}`;
}

// 채팅에 "내가 가르친 규칙 보여줘" 응답으로 쓸 형태 — 요청서 26번, raw JSON을 그대로 보여주지
// 않는다. 알려진 seed 규칙은 자연스러운 한국어로, 그 외 사용자가 새로 가르친 규칙은 값에서
// 알아볼 수 있는 필드를 최대한 문장으로 풀고, 그마저 없으면 짧게 요약한다.
export function formatMemoryForUser(memory: OliviaMemoryRow): string {
  const value = memory.value || {};

  if (memory.memory_type === "alias") {
    const canonical = typeof value.canonical === "string" ? value.canonical : "";
    const terms = Array.isArray(value.terms) && value.terms.length ? value.terms.join("/") : memory.key;
    return canonical ? `"${terms}"라고 하면 ${canonical}로 이해` : `"${terms}" 별칭`;
  }

  if (memory.key === "quote_auto_client_project_creation") {
    return "견적 요청 시 신규 고객이면 자동 등록하고, 프로젝트도 자동 생성한 뒤 바로 견적서를 만듦(고객 등록을 먼저 요구하지 않음)";
  }
  if (memory.key === "storyboard_person_list_split") {
    return "콘티에 인물 목록을 주면 사람마다 각각 별도 항목으로 만들고, 전체 목록을 각 항목에 반복해서 넣지 않음";
  }
  if (memory.key === "storyboard_location_no_inference") {
    return "위치 정보는 명시적 근거 없이 층수 등을 추측해서 저장하지 않음";
  }

  const parts: string[] = [];
  if (typeof value.ifClientMissing === "string") parts.push(value.ifClientMissing === "create_client_from_request" ? "고객 없으면 자동 등록" : `고객 처리: ${value.ifClientMissing}`);
  if (typeof value.ifProjectMissing === "string") parts.push(value.ifProjectMissing === "create_project_from_request" ? "프로젝트 없으면 자동 생성" : `프로젝트 처리: ${value.ifProjectMissing}`);
  if (parts.length) return parts.join(", ");

  const summary = JSON.stringify(value);
  return `${memory.key}: ${summary.length > 120 ? `${summary.slice(0, 120)}…` : summary}`;
}
