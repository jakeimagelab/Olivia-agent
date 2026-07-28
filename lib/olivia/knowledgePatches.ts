import type { SupabaseClient } from "@supabase/supabase-js";

// Olivia 지식 패치 — 실시간 파인튜닝이 아니라, 저장해 둔 인사이트를 관련 대화의
// 시스템 프롬프트에 자동으로 끼워 넣는 방식. lib/assistant/core/legacyOliviaCore.ts의
// processOliviaRequest에서 systemWithContext를 만들 때 호출한다.

export type KnowledgePatch = {
  id: string;
  title: string;
  category: string;
  content: string;
  created_at: string;
};

const PAGE_CONTEXT_CATEGORY_HINTS: { pattern: RegExp; category: string }[] = [
  { pattern: /마케팅|marketing/i, category: "marketing" },
  { pattern: /워크플로우|workflow/i, category: "workflow" },
  { pattern: /고객|client/i, category: "client_comm" },
];

// pageContext(화면 이름) 문자열에서 지식 패치 카테고리를 추정한다.
// 매칭되는 게 없으면 null — 호출부에서는 카테고리 상관없이 최근 패치를 가져온다.
export function guessKnowledgeCategory(pageContext?: string | null): string | null {
  if (!pageContext) return null;
  const hit = PAGE_CONTEXT_CATEGORY_HINTS.find((h) => h.pattern.test(pageContext));
  return hit?.category ?? null;
}

// 패치가 계속 쌓여도 컨텍스트가 무한정 커지지 않도록 최신순 상위 N개로 제한한다.
export async function fetchActiveKnowledgePatches(
  db: SupabaseClient,
  category: string | null,
  limit = 5
): Promise<KnowledgePatch[]> {
  try {
    let query = db
      .from("olivia_knowledge_patches")
      .select("id, title, category, content, created_at")
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (category) query = query.eq("category", category);

    const { data, error } = await query;
    if (error) return [];
    return data ?? [];
  } catch {
    // 마이그레이션 전(테이블 없음) 등 어떤 이유로든 실패해도 채팅 자체는 막지 않는다.
    return [];
  }
}

export function formatKnowledgePatchContext(patches: KnowledgePatch[]): string {
  if (patches.length === 0) return "";
  const lines = patches.map((p) => `- [${p.title}] ${p.content}`);
  return `다음은 참고해야 할 축적된 인사이트입니다 (Olivia 지식 패치):\n${lines.join("\n\n")}`;
}
