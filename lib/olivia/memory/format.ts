import type { OliviaMemoryRow, OliviaMemoryType } from "./types";

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

// Olivia OS 2.0 — Hermes Chat Intelligence Upgrade §2/§3. Hermes에게 넘길 Memory는 raw row가
// 아니라 이 좁은 모양만 노출한다("모든 Memory를 무조건 넣지 않는다" — caller가 scope로 이미
// 걸러서 넘긴 것만 여기서 형태만 다듬는다). rule_candidate는 아직 공식 규칙이 아니므로
// status로 구분해 Hermes가 강제 규칙과 미승인 후보를 혼동하지 않게 한다.
export type HermesMemoryEntry = {
  id: string;
  type: OliviaMemoryType;
  scope: string | null;
  content: string;
  status: "approved" | "candidate";
  source: string | null;
};

export function toHermesMemoryEntry(memory: OliviaMemoryRow): HermesMemoryEntry {
  return {
    id: memory.id,
    type: memory.memory_type,
    scope: memory.scope,
    content: `${memory.key}: ${JSON.stringify(memory.value)}`,
    status: memory.memory_type === "rule_candidate" ? "candidate" : "approved",
    source: memory.source,
  };
}

// approved는 강제 규칙으로, candidate는 참고용 후보로 명확히 분리해서 System Prompt에 넣는다
// (요청서 §3 "Hermes에게 둘의 차이를 명확히 전달한다").
export function formatHermesMemoryBlock(entries: HermesMemoryEntry[]): string {
  if (!entries.length) return "";
  const approved = entries.filter((entry) => entry.status === "approved");
  const candidates = entries.filter((entry) => entry.status === "candidate");
  const line = (entry: HermesMemoryEntry) => `- [scope=${entry.scope ?? "전체"}] ${entry.content}`;
  const blocks: string[] = [];
  if (approved.length) {
    blocks.push([
      "<approved_rules>",
      "사용자가 이미 승인했거나 확정한 업무 규칙이다. 아래 일반 원칙보다 우선 적용하고 반드시 지킨다.",
      ...approved.map(line),
      "</approved_rules>",
    ].join("\n"));
  }
  if (candidates.length) {
    blocks.push([
      "<rule_candidates>",
      "아직 공식 규칙으로 승인되지 않은 반복 패턴 후보다. 참고만 하고 강제 규칙처럼 적용하지 않는다 — approved_rules와 충돌하면 approved_rules를 따른다.",
      ...candidates.map(line),
      "</rule_candidates>",
    ].join("\n"));
  }
  return blocks.join("\n");
}
