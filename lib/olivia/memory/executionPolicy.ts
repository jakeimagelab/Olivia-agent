import type { OliviaMemoryRow } from "./types";

export type ExecutionPolicy = {
  autoCreateClient?: boolean;
  autoCreateProject?: boolean;
  requireConfirmation?: boolean;
  aliases?: Record<string, string>;
  documentRules?: Record<string, unknown>;
};

// listActiveMemories()가 이미 priority desc, updated_at desc로 정렬해서 넘겨주므로, 여기서는
// "아직 안 채워진 필드만 채운다"는 순서로 순회하면 우선순위 높은/최신 규칙이 자연히 이긴다.
// 같은 key+scope는 DB unique 제약상 한 행만 존재해서(수정 시 덮어씀) 진짜 충돌은 애초에 안 생긴다.
export function resolveExecutionPolicy(memories: OliviaMemoryRow[]): ExecutionPolicy {
  const policy: ExecutionPolicy = {};
  const aliases: Record<string, string> = {};
  const documentRules: Record<string, unknown> = {};

  for (const memory of memories) {
    if (!memory.is_active) continue;
    const value = (memory.value || {}) as Record<string, unknown>;

    if (memory.memory_type === "business_rule" || memory.memory_type === "workflow_rule") {
      if (policy.autoCreateClient === undefined && typeof value.ifClientMissing === "string") {
        policy.autoCreateClient = value.ifClientMissing === "create_client_from_request";
      }
      if (policy.autoCreateProject === undefined && typeof value.ifProjectMissing === "string") {
        policy.autoCreateProject = value.ifProjectMissing === "create_project_from_request";
      }
      if (policy.requireConfirmation === undefined && typeof value.requireConfirmation === "boolean") {
        policy.requireConfirmation = value.requireConfirmation;
      }
      continue;
    }

    if (memory.memory_type === "alias") {
      const canonical = typeof value.canonical === "string" ? value.canonical : undefined;
      if (!canonical) continue;
      const terms = Array.isArray(value.terms) ? value.terms.filter((term): term is string => typeof term === "string") : [];
      for (const term of [...terms, memory.key]) {
        if (!(term in aliases)) aliases[term] = canonical;
      }
      continue;
    }

    if (memory.memory_type === "document_rule") {
      if (!(memory.key in documentRules)) documentRules[memory.key] = value;
    }
  }

  if (Object.keys(aliases).length) policy.aliases = aliases;
  if (Object.keys(documentRules).length) policy.documentRules = documentRules;
  return policy;
}
