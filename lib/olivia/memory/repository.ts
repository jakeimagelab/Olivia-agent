import type { SupabaseClient } from "@supabase/supabase-js";
import type { OliviaMemoryRow, OliviaMemoryType } from "./types";

// olivia_agent_memory 테이블에 대한 얇은 데이터 접근 레이어 — lib/olivia/tools/*.ts와 같은 스타일.
// 이 테이블은 마이그레이션 파일(supabase/olivia-agent-memory-schema.sql)만 존재하고 원격에
// 자동 적용되지 않으므로, 테이블이 아직 없는 환경에서는 모든 함수가 조용히 빈 값을 돌려준다
// (throw하지 않음 — 배포 전 상태에서도 기존 도구/요청 흐름이 절대 깨지면 안 된다).
function isMissingTableError(error: { code?: string; message?: string } | null) {
  if (!error) return false;
  return error.code === "42P01" || /relation .* does not exist/i.test(error.message || "");
}

// 이 함수는 create_quote 같은 기존(사전 테스트로 검증된) 도구 흐름 한가운데서 항상 먼저
// 호출된다 — 테이블이 없거나(마이그레이션 미적용) 예상 밖의 에러가 나도 기존 흐름을 절대
// 막으면 안 되므로, {error} 응답뿐 아니라 동기/비동기 throw까지 전부 여기서 삼키고 빈 배열을
// 돌려준다.
export async function listActiveMemories(
  db: SupabaseClient,
  input: { scopes?: string[]; memoryTypes?: OliviaMemoryType[] } = {},
): Promise<OliviaMemoryRow[]> {
  try {
    let query = db.from("olivia_agent_memory").select("*").eq("is_active", true).order("priority", { ascending: false }).order("updated_at", { ascending: false });
    if (input.scopes?.length) query = query.in("scope", input.scopes);
    if (input.memoryTypes?.length) query = query.in("memory_type", input.memoryTypes);
    const { data, error } = await query;
    if (error) {
      if (!isMissingTableError(error)) console.error("[OliviaMemory] listActiveMemories 실패", error);
      return [];
    }
    return (data || []) as OliviaMemoryRow[];
  } catch (error) {
    console.error("[OliviaMemory] listActiveMemories 예외", error);
    return [];
  }
}

export async function findMemoryByKeyScope(db: SupabaseClient, key: string, scope: string | null): Promise<OliviaMemoryRow | null> {
  try {
    let query = db.from("olivia_agent_memory").select("*").eq("key", key);
    query = scope ? query.eq("scope", scope) : query.is("scope", null);
    const { data, error } = await query.maybeSingle();
    if (error) {
      if (!isMissingTableError(error)) console.error("[OliviaMemory] findMemoryByKeyScope 실패", error);
      return null;
    }
    return (data as OliviaMemoryRow) ?? null;
  } catch (error) {
    console.error("[OliviaMemory] findMemoryByKeyScope 예외", error);
    return null;
  }
}

export type CreateMemoryInput = {
  memoryType: OliviaMemoryType;
  key: string;
  value: Record<string, unknown>;
  scope?: string | null;
  priority?: number;
  source?: string | null;
  sourceMessageId?: string | null;
};

export async function createMemory(db: SupabaseClient, input: CreateMemoryInput): Promise<OliviaMemoryRow | null> {
  const { data, error } = await db.from("olivia_agent_memory").insert({
    memory_type: input.memoryType,
    key: input.key,
    value: input.value,
    scope: input.scope ?? null,
    priority: input.priority ?? 50,
    source: input.source ?? "user_teaching",
    source_message_id: input.sourceMessageId ?? null,
  }).select("*").single();
  if (error) {
    if (isMissingTableError(error)) throw new Error("Agent Memory 테이블이 아직 없어요. 관리자가 마이그레이션을 적용해야 합니다.");
    throw new Error(error.message || "업무 규칙 저장에 실패했어요.");
  }
  return data as OliviaMemoryRow;
}

export async function updateMemory(db: SupabaseClient, id: string, patch: Partial<{ value: Record<string, unknown>; priority: number; scope: string | null; isActive: boolean }>): Promise<OliviaMemoryRow | null> {
  const payload: Record<string, unknown> = {};
  if (patch.value !== undefined) payload.value = patch.value;
  if (patch.priority !== undefined) payload.priority = patch.priority;
  if (patch.scope !== undefined) payload.scope = patch.scope;
  if (patch.isActive !== undefined) payload.is_active = patch.isActive;
  const { data, error } = await db.from("olivia_agent_memory").update(payload).eq("id", id).select("*").single();
  if (error) {
    if (isMissingTableError(error)) throw new Error("Agent Memory 테이블이 아직 없어요. 관리자가 마이그레이션을 적용해야 합니다.");
    throw new Error(error.message || "업무 규칙 수정에 실패했어요.");
  }
  return data as OliviaMemoryRow;
}

// 요청서 14번 — 규칙 삭제는 기본적으로 soft delete(is_active=false)한다.
export async function deactivateMemory(db: SupabaseClient, id: string): Promise<void> {
  const { error } = await db.from("olivia_agent_memory").update({ is_active: false }).eq("id", id);
  if (error && !isMissingTableError(error)) throw new Error(error.message || "업무 규칙 비활성화에 실패했어요.");
}

// 요청서 21-22번 — 실제 Tool 실행이 이 규칙을 써서 성공/실패했을 때 카운트만 반영한다.
// confidence 자동 하향이나 자동 삭제는 하지 않는다(요구사항: 반복 실패해도 자동 삭제 금지).
export async function recordMemoryOutcome(db: SupabaseClient, id: string, outcome: { success: boolean }): Promise<void> {
  const { data } = await db.from("olivia_agent_memory").select("usage_count,success_count,failure_count").eq("id", id).maybeSingle();
  if (!data) return;
  await db.from("olivia_agent_memory").update({
    usage_count: (data.usage_count || 0) + 1,
    success_count: (data.success_count || 0) + (outcome.success ? 1 : 0),
    failure_count: (data.failure_count || 0) + (outcome.success ? 0 : 1),
  }).eq("id", id);
}
