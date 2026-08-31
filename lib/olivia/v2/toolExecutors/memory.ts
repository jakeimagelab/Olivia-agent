import { getSupabaseAdmin } from "@/lib/supabase";
import { OLIVIA_MEMORY_TYPES, type OliviaMemoryType } from "@/lib/olivia/memory/types";
import { createMemory, deactivateMemory, findMemoryByKeyScope, listActiveMemories, updateMemory } from "@/lib/olivia/memory/repository";
import { formatMemoryForUser } from "@/lib/olivia/memory/format";
import type { OliviaContextSnapshot, OliviaToolResult } from "@/lib/olivia/v2/types";
import { text } from "./common";
import { createVerification } from "./verification";

export const MEMORY_TOOL_NAMES = ["save_agent_memory", "update_agent_memory", "disable_agent_memory", "list_agent_memories"] as const;

export async function executeMemoryTool(
  name: string,
  input: Record<string, unknown>,
  _context: OliviaContextSnapshot,
): Promise<OliviaToolResult> {
  const db = getSupabaseAdmin();

  if (name === "save_agent_memory") {
    const memoryType = text(input, "memoryType") as OliviaMemoryType;
    if (!OLIVIA_MEMORY_TYPES.includes(memoryType)) throw new Error("지원하지 않는 규칙 종류예요.");
    const key = text(input, "key");
    if (!key) throw new Error("규칙을 식별할 key가 필요해요.");
    const scope = text(input, "scope") || null;
    let value: Record<string, unknown>;
    try {
      value = JSON.parse(text(input, "value") || "{}");
    } catch {
      throw new Error("규칙 내용을 이해하지 못했어요.");
    }
    const priority = typeof input.priority === "number" ? input.priority : undefined;
    const existing = await findMemoryByKeyScope(db, key, scope);
    const saved = existing
      ? await updateMemory(db, existing.id, { value, priority })
      : await createMemory(db, { memoryType, key, value, scope, priority, source: "user_teaching" });
    if (!saved) throw new Error("업무 규칙 저장에 실패했어요.");
    return {
      tool: name, success: true,
      data: { id: saved.id, key, scope, summary: formatMemoryForUser(saved) },
      verification: createVerification({ executed: true, persisted: true, resourceExists: true }),
    };
  }

  if (name === "update_agent_memory") {
    const key = text(input, "key");
    const scope = text(input, "scope") || null;
    if (!key) throw new Error("수정할 규칙의 key가 필요해요.");
    const existing = await findMemoryByKeyScope(db, key, scope);
    if (!existing) throw new Error(`"${key}" 규칙을 찾지 못했어요. list_agent_memories로 정확한 key를 먼저 확인해주세요.`);
    const rawValue = text(input, "value");
    let mergedValue: Record<string, unknown> | undefined;
    if (rawValue) {
      try {
        mergedValue = { ...existing.value, ...JSON.parse(rawValue) };
      } catch {
        throw new Error("규칙 내용을 이해하지 못했어요.");
      }
    }
    const priority = typeof input.priority === "number" ? input.priority : undefined;
    const saved = await updateMemory(db, existing.id, { value: mergedValue, priority });
    if (!saved) throw new Error("업무 규칙 수정에 실패했어요.");
    return {
      tool: name, success: true,
      data: { id: saved.id, key, scope, summary: formatMemoryForUser(saved) },
      verification: createVerification({ executed: true, persisted: true, resourceExists: true }),
    };
  }

  if (name === "disable_agent_memory") {
    const key = text(input, "key");
    const scope = text(input, "scope") || null;
    if (!key) throw new Error("삭제할 규칙의 key가 필요해요.");
    const existing = await findMemoryByKeyScope(db, key, scope);
    if (!existing) throw new Error(`"${key}" 규칙을 찾지 못했어요.`);
    await deactivateMemory(db, existing.id);
    return {
      tool: name, success: true,
      data: { key, scope, summary: `"${key}" 규칙을 더 이상 적용하지 않을게요.` },
      verification: createVerification({ executed: true, persisted: true, details: { resourceExists: false } }),
    };
  }

  if (name === "list_agent_memories") {
    const scope = text(input, "scope") || undefined;
    const memories = await listActiveMemories(db, scope ? { scopes: [scope] } : {});
    return {
      tool: name,
      success: true,
      data: { count: memories.length, items: memories.map((memory) => ({ key: memory.key, scope: memory.scope, summary: formatMemoryForUser(memory) })) },
      verification: createVerification({ executed: true, resourceExists: memories.length > 0 }),
    };
  }

  throw new Error("지원하지 않는 Olivia 작업이에요.");
}
