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
  contracts: [
    { id: "contract-1", quote_number: "PC-1", hospital_name: "히어산부인과", client_id: "client-1", workflow_run_id: "proj-1", signature_data_url: null, created_at: "2026-08-11T00:00:00Z", updated_at: "2026-08-11T00:00:00Z" },
  ],
  conti_saves: [
    { id: "c1", hospital_name: "히어산부인과", title: "홈페이지 촬영 콘티", client_id: "client-1", workflow_run_id: "proj-1", saved_at: "2026-08-15T00:00:00Z" },
    { id: "c2", hospital_name: "히어산부인과", title: "인스타 콘티", client_id: "client-1", workflow_run_id: "proj-1", saved_at: "2026-08-22T00:00:00Z" },
  ],
  conti_runs: [
    { id: "run-1", hospital_name: "히어산부인과", hospital_id: "client-1", workflow_run_id: "proj-1", specialty: "피부과", created_at: "2026-08-16T00:00:00Z", updated_at: "2026-08-16T00:00:00Z" },
  ],
  consultation_memos: [
    { id: "memo-1", hospital_id: "client-1", summary: "촬영 상담 메모", raw_memo: "상담 내용", created_at: "2026-08-17T00:00:00Z" },
  ],
  client_reviews: [
    { id: "review-1", client_id: "client-1", workflow_run_id: "proj-1", writer_name: "김고객", public_review_text: "촬영이 만족스러웠어요", source_channel: "naver", content_status: "unused", delivered_at: "2026-08-18", created_at: "2026-08-18T00:00:00Z", updated_at: "2026-08-18T00:00:00Z", clients: { hospital_name: "히어산부인과" } },
  ],
  photo_galleries: [
    { id: "gallery-1", hospital_name: "히어산부인과", client_id: "client-1", workflow_run_id: "proj-1", gallery_type: "final_photo", created_at: "2026-08-19T00:00:00Z" },
  ],
  select_galleries: [
    { id: "select-1", title: "히어 셀렉", hospital_name: "히어산부인과", client_id: "client-1", workflow_run_id: "proj-1", created_at: "2026-08-20T00:00:00Z" },
  ],
  mailing_queue: [],
  workflow_runs: [
    { id: "proj-1", project_name: "히어 홈페이지 리뉴얼" },
    { id: "proj-2", project_name: "라셀 브랜드 캠페인" },
  ],
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
    in: (col: string, vals: unknown[]) => { rows = rows.filter((row) => vals.includes(row[col])); return builder; },
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
  it("맵퍼가 견적 row를 올바른 OliviaDocumentRef로 변환하고 프로젝트명을 붙인다(빈 title은 병원명+번호로 대체)", async () => {
    const docs = await searchDocuments({ clientName: "히어산부인과", types: ["quote"] });
    expect(docs).toHaveLength(1);
    expect(docs[0]).toMatchObject({ type: "quote", sourceType: "quotes", sourceId: "q1", title: "히어산부인과 견적서 (PC-1)", clientId: "client-1", projectName: "히어 홈페이지 리뉴얼", route: "/quote?resourceId=q1" });
  });

  it("고객명으로 스코프를 좁히면 다른 고객의 문서는 나오지 않는다", async () => {
    const docs = await searchDocuments({ clientName: "히어산부인과", types: ["quote"] });
    expect(docs.map((d) => d.sourceId)).toEqual(["q1"]);
  });

  it("고객 스코프 안에서는 최근 수정 순으로 정렬한다(saved_at DESC)", async () => {
    const docs = await searchDocuments({ clientName: "히어산부인과", types: ["storyboard"] });
    expect(docs.map((d) => d.sourceId)).toEqual(["c2", "run-1", "c1"]);
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

  it("각 문서 타입이 고객 화면이 아니라 자기 문서의 실제 열람 경로를 가진다", async () => {
    const docs = await searchDocuments({ clientName: "히어산부인과", limit: 50 });
    const routes = new Map(docs.map((doc) => [doc.sourceId, doc.route]));

    expect(routes.get("q1")).toBe("/quote?resourceId=q1");
    expect(routes.get("contract-1")).toBe("/contract?resourceId=contract-1");
    expect(routes.get("c1")).toBe("/conti?resourceId=c1");
    expect(routes.get("run-1")).toBe("/conti?resourceId=run-1");
    expect(routes.get("memo-1")).toBe("/memo?resourceId=memo-1");
    expect(routes.get("review-1")).toBe("/review-studio?reviewId=review-1");
    expect(routes.get("gallery-1")).toBe("/gallery?galleryId=gallery-1");
    expect(routes.get("select-1")).toBe("/select-galleries/select-1");
    expect([...routes.values()].some((route) => route?.startsWith("/clients"))).toBe(false);
  });
});
