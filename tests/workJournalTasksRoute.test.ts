import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const rows = [
  { id: "1", due_date: "2026-09-16", title: "촬영 준비물 확인", memo: "", work_journal_checklist_items: [] },
  { id: "2", due_date: "2026-09-17", title: "견적서 작업 완료 확인", memo: "메일 발송", work_journal_checklist_items: [] },
  { id: "3", due_date: "2026-09-18", title: "다른 업무", memo: "", work_journal_checklist_items: [] },
];

// calendarReliability.test.ts/memoReliability.test.ts와 동일한 관례 — @/lib/supabase를
// 통째로 모킹해 실제 Supabase 없이 route 핸들러의 쿼리 조립 로직(from/to/q 신규 분기)만 검증한다.
vi.mock("@/lib/supabase", () => ({
  getSupabaseAdmin: () => ({
    from: (table: string) => {
      if (table !== "work_journal_tasks") throw new Error(`unexpected table: ${table}`);
      const builder: any = {
        _rows: rows,
        select: () => builder,
        gte: (key: string, value: string) => { builder._rows = builder._rows.filter((row: any) => row[key] >= value); return builder; },
        lte: (key: string, value: string) => { builder._rows = builder._rows.filter((row: any) => row[key] <= value); return builder; },
        eq: (key: string, value: string) => { builder._rows = builder._rows.filter((row: any) => row[key] === value); return builder; },
        or: (expr: string) => {
          const needle = /ilike\.%([^,%]+)%/.exec(expr)?.[1] ?? "";
          builder._rows = builder._rows.filter((row: any) => row.title.includes(needle) || row.memo.includes(needle));
          return builder;
        },
        order: () => builder,
        limit: () => builder,
        then: (resolve: (value: unknown) => unknown) => Promise.resolve(resolve({ data: builder._rows, error: null })),
      };
      return builder;
    },
  }),
}));

import { GET } from "@/app/api/work-journal/tasks/route";

function req(query: string) {
  return new NextRequest(`http://localhost/api/work-journal/tasks?${query}`);
}

describe("GET /api/work-journal/tasks — from/to/q 추가(기존 date/month 동작은 안 건드림)", () => {
  it("from/to 범위로 조회한다", async () => {
    const res = await GET(req("from=2026-09-16&to=2026-09-17"));
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.tasks.map((t: any) => t.id)).toEqual(["1", "2"]);
  });

  it("from만 있고 to가 없으면 400을 반환한다", async () => {
    const res = await GET(req("from=2026-09-16"));
    expect(res.status).toBe(400);
  });

  it("q만 있으면 title/memo 부분일치로 검색한다(날짜 제한 없음)", async () => {
    const res = await GET(req("q=견적서"));
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.tasks.map((t: any) => t.id)).toEqual(["2"]);
  });

  it("date만 있는 기존 동작은 그대로 동작한다(회귀 방지)", async () => {
    const res = await GET(req("date=2026-09-16"));
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.tasks.map((t: any) => t.id)).toEqual(["1"]);
  });

  it("아무 파라미터도 없으면 여전히 date 형식 오류로 거부한다(회귀 방지, 무제한 조회 금지)", async () => {
    const res = await GET(req(""));
    expect(res.status).toBe(400);
  });
});
