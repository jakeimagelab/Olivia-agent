export type OliviaMemoryType =
  | "business_rule"
  | "alias"
  | "preference"
  | "correction"
  | "workflow_rule"
  | "document_rule"
  | "tool_behavior";

export const OLIVIA_MEMORY_TYPES: readonly OliviaMemoryType[] = [
  "business_rule", "alias", "preference", "correction", "workflow_rule", "document_rule", "tool_behavior",
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
