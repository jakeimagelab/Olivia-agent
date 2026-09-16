export type OliviaMemoryType =
  | "business_rule"
  | "alias"
  | "preference"
  | "correction"
  | "workflow_rule"
  | "document_rule"
  | "tool_behavior"
  // Olivia OS 2.0 §9 — Hermes가 반복 패턴을 "공식 규칙 후보"로 제안할 때만 쓴다. 이 타입은
  // resolveExecutionPolicy()가 인식하지 않으므로 저장돼도 실제 동작에 아무 영향이 없다(의도적
  // inert 상태) — approve_agent_memory_rule로 명시 승인되어 memory_type이 바뀌기 전까지는
  // 절대 적용되지 않는다. "최종 Rule 승인은 Olivia/User가 한다"(§9)를 코드로 강제하는 지점.
  | "rule_candidate";

export const OLIVIA_MEMORY_TYPES: readonly OliviaMemoryType[] = [
  "business_rule", "alias", "preference", "correction", "workflow_rule", "document_rule", "tool_behavior",
  "rule_candidate",
];

/** rule_candidate가 approve_agent_memory_rule로 승격될 수 있는 실제 규칙 타입만 허용한다. */
export const OLIVIA_PROMOTABLE_MEMORY_TYPES: readonly OliviaMemoryType[] = [
  "business_rule", "workflow_rule", "document_rule", "preference", "tool_behavior",
];

export interface OliviaMemoryRow {
  id: string;
  memory_type: OliviaMemoryType;
  key: string;
  value: Record<string, unknown>;
  scope: string | null;
  priority: number;
  confidence: number;
  source: string | null;
  source_message_id: string | null;
  usage_count: number;
  success_count: number;
  failure_count: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}
