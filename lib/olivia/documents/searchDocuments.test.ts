import { describe, expect, it, vi } from "vitest";

type Row = Record<string, any>;

const FIXTURES: Record<string, Row[]> = {
  clients: [
    { id: "client-1", hospital_name: "히어산부인과" },
    { id: "client-2", hospital_name: "라셀의원" },
  ],
  quotes: [
    { id: "q1", quote_number: "PC-1", title: "", hospital_name: "히어산부인과", client_id: "client-1", workflow_run_id: "proj-1", status: "draft", created_at: "2026-01-01", updated_at: "2026-08-10T00:00:00Z" },
    { id: "q2", quote_number: "PC-2", title: "", hospital_name: "라셀의원", client_id: "client-2", workflow_run_id: "proj-2", status: "draft", created_at: "2026-01-01", updated_at: "2026-08-20T00:00:00Z" },
  ],
  contracts: [],
  conti_saves: [
    { id: "c1", hospital_name: "히어산부인과", title: "홈페이지 촬영 콘티", client_id: "client-1", workflow_run_id: "proj-1", saved_at: "2026-08-15T00:00:00Z" },
    { id: "c2", hospital_name: "히어산부인과", title: "인스타 콘티", client_id: "client-1", workflow_run_id: "proj-1", saved_at: "2026-08-22T00:00:00Z" },
  ],
  consultation_memos: [],
  photo_galleries: [],
  select_galleries: [],
  mailing_queue: [],
};

function applyEq(rows: Row[], col: string, val: unknown) {
  return rows.filter((row) => row[col] === val);
}

function applyIlike(rows: Row[], col: string, pattern: string) {
  const needle = pattern.replace(/%/g, "").toLowerCase();
  return rows.filter((row) => String(row[col] || "").toLowerCase().includes(needle));
}

function makeQuery(initialRows: Row[]) {
  let rows = initialRows;
  const builder: any = {
    select: () => builder,
    order: () => builder,
    limit: (n: number) => { rows = rows.slice(0, n); return builder; },
    eq: (col: string, val: unknown) => { rows = applyEq(rows, col, val); return builder; },
    ilike: (col: string, pattern: string) => { rows = applyIlike(rows, col, pattern); return builder; },
    maybeSingle: async () => ({ data: rows[0] ?? null, error: null }),
    then: (onFulfilled: any, onRejected?: any) => Promise.resolve({ data: rows, error: null }).then(onFulfilled, onRejected),
  };
  return builder;
}

vi.mock("@/lib/supabase", () => ({
  getSupabaseAdmin: () => ({ from: (table: string) => makeQuery(FIXTURES[table] ? [...FIXTURES[table]] : []) }),
}));

const { searchDocuments } = await import("./searchDocuments");

describe("searchDocuments", () => {
  it("맵퍼가 견적 row를 올바른 OliviaDocumentRef로 변환한다(빈 title은 병원명+번호로 대체)", async () => {
    const docs = await searchDocuments({ clientName: "히어산부인과", types: ["quote"] });
    expect(docs).toHaveLength(1);
    expect(docs[0]).toMatchObject({ type: "quote", sourceType: "quotes", sourceId: "q1", title: "히어산부인과 견적서 (PC-1)", clientId: "client-1" });
  });

  it("고객명으로 스코프를 좁히면 다른 고객의 문서는 나오지 않는다", async () => {
    const docs = await searchDocuments({ clientName: "히어산부인과", types: ["quote"] });
    expect(docs.map((d) => d.sourceId)).toEqual(["q1"]);
  });

  it("고객 스코프 안에서는 최근 수정 순으로 정렬한다(saved_at DESC)", async () => {
    const docs = await searchDocuments({ clientName: "히어산부인과", types: ["storyboard"] });
    expect(docs.map((d) => d.sourceId)).toEqual(["c2", "c1"]);
  });

  it("현재 선택된 고객과 정확히 일치하는 문서가 최신순보다 우선한다", async () => {
    // q2가 q1보다 최신(updated_at)이지만, currentClientId가 q1의 고객이면 q1이 먼저 나와야 한다.
    const docs = await searchDocuments({ types: ["quote"], currentClientId: "client-1" });
    expect(docs[0].sourceId).toBe("q1");
  });

  it("고객명 텍스트 fuzzy 매칭으로 부분 일치하는 문서를 찾는다", async () => {
    const docs = await searchDocuments({ query: "라셀", types: ["quote"] });
    expect(docs.map((d) => d.sourceId)).toEqual(["q2"]);
  });

  it("일치하는 문서가 없으면 빈 배열을 돌려준다(단정적으로 실패하지 않고 호출부가 판단)", async () => {
    const docs = await searchDocuments({ clientName: "존재하지않는병원", types: ["quote"] });
    expect(docs).toEqual([]);
  });

  it("documentType 필터로 요청한 타입의 테이블만 조회한다", async () => {
    const docs = await searchDocuments({ clientName: "히어산부인과", types: ["quote", "storyboard"] });
    const types = new Set(docs.map((d) => d.type));
    expect(types.has("quote")).toBe(true);
    expect(types.has("storyboard")).toBe(true);
    expect(types.has("contract")).toBe(false);
  });
});
