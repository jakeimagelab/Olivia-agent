import type { SupabaseClient } from "@supabase/supabase-js";

// 저장은 "닥터포유홍대점", 검색은 "닥터포유 홍대점"처럼 공백 유무가 어긋나는 경우
// ilike만으로는 못 찾는다 — 공백을 지우고 소문자로 맞춰서 비교한다.
export function normalizeSearchText(value: unknown): string {
  return String(value ?? "").toLowerCase().replace(/\s+/g, "");
}

export function fuzzyIncludes(target: unknown, query: unknown): boolean {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) return false;
  return normalizeSearchText(target).includes(normalizedQuery);
}

type QueryBuilder = any;

type FuzzyNameSearchParams = {
  db: SupabaseClient;
  table: string;
  nameColumn: string;
  select: string;
  query: string;
  limit?: number;
  candidateLimit?: number;
  filter?: (q: QueryBuilder) => QueryBuilder;
};

// 1) 기존 방식대로 ilike로 먼저 찾는다. 2) 0건이면 후보를 넓게 가져와서
// 공백 제거 후 부분일치로 재비교한다 (candidateLimit 기본 500건까지).
export async function fuzzyNameSearch<T = any>(params: FuzzyNameSearchParams): Promise<T[]> {
  const { db, table, nameColumn, select, query, limit = 10, candidateLimit = 500, filter } = params;
  const keyword = String(query ?? "").trim();
  if (!keyword) return [];

  let exactQuery: QueryBuilder = db.from(table).select(select);
  if (filter) exactQuery = filter(exactQuery);
  exactQuery = exactQuery.ilike(nameColumn, `%${keyword}%`).limit(limit);
  const { data: exact } = await exactQuery;
  if (exact && exact.length > 0) return exact as T[];

  let candidateQuery: QueryBuilder = db.from(table).select(select);
  if (filter) candidateQuery = filter(candidateQuery);
  candidateQuery = candidateQuery.limit(candidateLimit);
  const { data: candidates } = await candidateQuery;
  if (!candidates) return [];

  return (candidates as any[])
    .filter((row) => fuzzyIncludes(row?.[nameColumn], keyword))
    .slice(0, limit) as T[];
}

export async function fuzzyNameSearchOne<T = any>(params: Omit<FuzzyNameSearchParams, "limit">): Promise<T | null> {
  const results = await fuzzyNameSearch<T>({ ...params, limit: 1 });
  return results[0] ?? null;
}
