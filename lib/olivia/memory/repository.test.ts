import { describe, expect, it, vi } from "vitest";

type Row = Record<string, any>;

let TABLE: Row[] = [];

function applyEq(rows: Row[], col: string, val: unknown) {
  return rows.filter((row) => row[col] === val);
}

function applyIn(rows: Row[], col: string, vals: unknown[]) {
  return rows.filter((row) => vals.includes(row[col]));
}

function makeQuery() {
  let rows = TABLE;
  let insertedRow: Row | null = null;
  let updatePayload: Row | null = null;
  let targetId: string | null = null;
  const builder: any = {
    select: () => builder,
    order: () => builder,
    limit: (n: number) => { rows = rows.slice(0, n); return builder; },
    eq: (col: string, val: unknown) => {
      if (col === "id") targetId = val as string;
      rows = applyEq(rows, col, val);
      return builder;
    },
    is: (col: string, val: unknown) => {
      rows = rows.filter((row) => row[col] === val || (val === null && row[col] === undefined));
      return builder;
    },
    in: (col: string, vals: unknown[]) => { rows = applyIn(rows, col, vals); return builder; },
    insert: (payload: Row) => {
      insertedRow = { id: `mem-${TABLE.length + 1}`, usage_count: 0, success_count: 0, failure_count: 0, is_active: true, priority: 50, ...payload };
      return builder;
    },
    update: (payload: Row) => { updatePayload = payload; return builder; },
    single: async () => {
      if (insertedRow) { TABLE.push(insertedRow); return { data: insertedRow, error: null }; }
      if (updatePayload && targetId) {
        const row = TABLE.find((r) => r.id === targetId);
        if (row) Object.assign(row, updatePayload);
        return { data: row ?? null, error: null };
      }
      return { data: rows[0] ?? null, error: null };
    },
    maybeSingle: async () => {
      if (updatePayload && targetId) {
        const row = TABLE.find((r) => r.id === targetId);
        if (row) Object.assign(row, updatePayload);
        return { data: row ?? null, error: null };
      }
      return { data: rows[0] ?? null, error: null };
    },
    then: (onFulfilled: any, onRejected?: any) => Promise.resolve({ data: rows, error: null }).then(onFulfilled, onRejected),
  };
  return builder;
}

vi.mock("@/lib/supabase", () => ({
  getSupabaseAdmin: () => ({ from: () => makeQuery() }),
}));

const { listActiveMemories, findMemoryByKeyScope, createMemory, updateMemory, deactivateMemory, recordMemoryOutcome } = await import("./repository");
const { getSupabaseAdmin } = await import("@/lib/supabase");

describe("memory repository", () => {
  it("listActiveMemories는 활성 상태만, scope로 필터링해서 돌려준다", async () => {
    TABLE = [
      { id: "mem-1", memory_type: "business_rule", key: "a", value: {}, scope: "quote", is_active: true, priority: 50 },
      { id: "mem-2", memory_type: "business_rule", key: "b", value: {}, scope: "storyboard", is_active: true, priority: 50 },
      { id: "mem-3", memory_type: "business_rule", key: "c", value: {}, scope: "quote", is_active: false, priority: 50 },
    ];
    const db = getSupabaseAdmin();
    const results = await listActiveMemories(db, { scopes: ["quote"] });
    // is_active 필터는 .eq("is_active", true) 체인으로 걸리므로 mem-3(비활성)은 최종 결과에서
    // 제외돼야 한다 — 목(mock)은 순차 체이닝을 그대로 반영한다.
    expect(results.map((r) => r.id).sort()).toEqual(["mem-1"]);
  });

  it("createMemory로 새 규칙을 저장하고 findMemoryByKeyScope로 다시 찾을 수 있다", async () => {
    TABLE = [];
    const db = getSupabaseAdmin();
    const created = await createMemory(db, {
      memoryType: "business_rule",
      key: "quote_auto_client_project_creation",
      value: { ifClientMissing: "create_client_from_request" },
      scope: "quote",
      priority: 100,
    });
    expect(created?.key).toBe("quote_auto_client_project_creation");
    const found = await findMemoryByKeyScope(db, "quote_auto_client_project_creation", "quote");
    expect(found?.id).toBe(created?.id);
  });

  it("updateMemory는 기존 행의 value/priority를 덮어쓴다", async () => {
    TABLE = [{ id: "mem-1", memory_type: "business_rule", key: "a", value: { x: 1 }, scope: "quote", is_active: true, priority: 50 }];
    const db = getSupabaseAdmin();
    const updated = await updateMemory(db, "mem-1", { value: { x: 2 }, priority: 90 });
    expect(updated?.value).toEqual({ x: 2 });
    expect(updated?.priority).toBe(90);
  });

  it("deactivateMemory는 is_active를 false로 바꾼다(soft delete)", async () => {
    TABLE = [{ id: "mem-1", memory_type: "alias", key: "a", value: {}, scope: null, is_active: true, priority: 50 }];
    const db = getSupabaseAdmin();
    await deactivateMemory(db, "mem-1");
    expect(TABLE[0].is_active).toBe(false);
  });

  it("recordMemoryOutcome은 usage_count와 success_count/failure_count를 누적한다(자동 삭제하지 않음)", async () => {
    TABLE = [{ id: "mem-1", memory_type: "business_rule", key: "a", value: {}, scope: "quote", is_active: true, priority: 50, usage_count: 2, success_count: 2, failure_count: 0 }];
    const db = getSupabaseAdmin();
    await recordMemoryOutcome(db, "mem-1", { success: false });
    expect(TABLE[0].usage_count).toBe(3);
    expect(TABLE[0].success_count).toBe(2);
    expect(TABLE[0].failure_count).toBe(1);
    expect(TABLE[0].is_active).toBe(true);
  });
});
