import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  rows: [] as Array<Record<string, any>>,
  insertCalls: 0,
  failInsertAt: new Set<number>(),
  range: { start: "", end: "" },
}));

vi.mock("@/lib/supabase", () => ({
  getSupabaseAdmin: () => ({
    from: (table: string) => {
      if (table !== "calendar_tasks") throw new Error(`unexpected table: ${table}`);
      return {
        insert: (payload: Record<string, any>) => ({ select: () => ({ single: async () => {
          state.insertCalls += 1;
          if (state.failInsertAt.has(state.insertCalls)) return { data: null, error: { message: "time column error" } };
          const row = { id: `task-${state.insertCalls}`, ...payload };
          state.rows.push(row);
          return { data: row, error: null };
        } }) }),
        select: () => {
          let filtered = [...state.rows];
          const builder: any = {
            eq: (key: string, value: unknown) => { filtered = filtered.filter((row) => row[key] === value); return builder; },
            gte: (_key: string, value: string) => { state.range.start = value; filtered = filtered.filter((row) => row.date >= value); return builder; },
            lt: (_key: string, value: string) => { state.range.end = value; filtered = filtered.filter((row) => row.date < value); return builder; },
            order: () => builder,
            maybeSingle: async () => ({ data: filtered[0] ?? null, error: null }),
            single: async () => ({ data: filtered[0] ?? null, error: null }),
            then: (resolve: (value: unknown) => unknown) => Promise.resolve(resolve({ data: filtered, error: null })),
          };
          return builder;
        },
      };
    },
  }),
}));

vi.mock("@/lib/trash", () => ({ moveRecordToTrash: vi.fn() }));

import { addCalendarTask, resolveCalendarTaskId } from "@/lib/olivia/tools/calendar";
import { executeCalendarTool } from "@/lib/olivia/v2/toolExecutors/calendar";

const context = { recentActions: [], revision: 0 };

describe("Calendar reliable persistence", () => {
  beforeEach(() => {
    state.rows = [];
    state.insertCalls = 0;
    state.failInsertAt = new Set();
    state.range = { start: "", end: "" };
  });

  it("요청한 14:00을 저장 row에서 그대로 확인한다", async () => {
    const row = await addCalendarTask({ date: "2026-09-11", title: "WIN 촬영", time: "14:00" });
    expect(row).toMatchObject({ date: "2026-09-11", title: "WIN 촬영", time: "14:00" });
    expect(state.insertCalls).toBe(1);
  });

  it("time column 오류가 나도 필드를 제거해 재시도하지 않는다", async () => {
    state.failInsertAt.add(1);
    await expect(addCalendarTask({ date: "2026-09-11", title: "WIN 촬영", time: "14:00" }))
      .rejects.toMatchObject({ code: "DB_ERROR" });
    expect(state.insertCalls).toBe(1);
  });

  it("부분 제목 후보가 둘이면 첫 번째를 선택하지 않는다", async () => {
    state.rows = [
      { id: "a", date: "2026-09-11", title: "WIN 촬영", time: "14:00" },
      { id: "b", date: "2026-09-11", title: "강재활 촬영", time: "17:00" },
    ];
    await expect(resolveCalendarTaskId({ date: "2026-09-11", matchTitle: "촬영" }))
      .rejects.toMatchObject({ code: "AMBIGUOUS", details: { candidates: expect.any(Array) } });
  });

  it("월 조회 query에 올바른 exclusive end를 적용한다", async () => {
    await executeCalendarTool("calendar_list_month", { month: "2026-12" }, context);
    expect(state.range).toEqual({ start: "2026-12-01", end: "2027-01-01" });
  });

  it("bulk 5건 중 2건 실패를 부분 성공으로 명시한다", async () => {
    state.failInsertAt = new Set([2, 5]);
    const result = await executeCalendarTool("calendar_add_bulk", {
      tasks: Array.from({ length: 5 }, (_, index) => ({ date: "2026-09-11", title: `업무 ${index + 1}` })),
    }, context);
    expect(result).toMatchObject({
      success: false,
      code: "PARTIAL_SUCCESS",
      data: { requestedCount: 5, successCount: 3, failedCount: 2 },
      verification: { persisted: false },
    });
  });
});
