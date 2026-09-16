import { describe, expect, it, vi, beforeEach } from "vitest";

type Row = Record<string, unknown>;

let rows: Row[] = [];
let nextId = 1;

function fakeTable() {
  return {
    select() {
      const filters: Array<(row: Row) => boolean> = [];
      const builder = {
        eq(col: string, val: unknown) { filters.push((row) => row[col] === val); return builder; },
        is(col: string, val: unknown) { filters.push((row) => (val === null ? row[col] == null : row[col] === val)); return builder; },
        async maybeSingle() {
          const match = rows.find((row) => filters.every((f) => f(row)));
          return { data: match ?? null, error: null };
        },
      };
      return builder;
    },
    insert(payload: Row) {
      return {
        select() {
          return {
            async single() {
              const row: Row = { id: `mem-${nextId++}`, priority: 50, is_active: true, usage_count: 0, success_count: 0, failure_count: 0, created_at: new Date().toISOString(), updated_at: new Date().toISOString(), ...payload };
              rows.push(row);
              return { data: row, error: null };
            },
          };
        },
      };
    },
    update(patch: Row) {
      const filters: Array<(row: Row) => boolean> = [];
      const builder = {
        eq(col: string, val: unknown) { filters.push((row) => row[col] === val); return builder; },
        select() {
          return {
            async single() {
              const match = rows.find((row) => filters.every((f) => f(row)));
              if (!match) return { data: null, error: { message: "not found" } };
              Object.assign(match, patch);
              return { data: match, error: null };
            },
          };
        },
      };
      return builder;
    },
  };
}

vi.mock("@/lib/supabase", () => ({
  getSupabaseAdmin: () => ({ from: () => fakeTable() }),
}));

// resolveExecutionPolicy는 memory_type이 "rule_candidate"인 row를 인식하지 못한다 — 이걸
// 이용해 승인 전까지 절대 적용되지 않는다는 걸 증명한다.
import { resolveExecutionPolicy } from "@/lib/olivia/memory/executionPolicy";
import { executeMemoryTool } from "@/lib/olivia/v2/toolExecutors/memory";
import type { OliviaMemoryRow } from "@/lib/olivia/memory/types";

const context = { recentActions: [], revision: 0 };

beforeEach(() => {
  rows = [];
  nextId = 1;
});

describe("규칙 후보 제안/승인 워크플로 (Olivia OS 2.0 §9)", () => {
  it("propose_agent_memory_rule은 rule_candidate로 저장되고 즉시 적용되지 않는다", async () => {
    const result = await executeMemoryTool("propose_agent_memory_rule", {
      key: "auto_create_project_for_new_client",
      scope: "quote",
      proposedType: "business_rule",
      proposedValue: JSON.stringify({ ifClientMissing: "create_client_from_request" }),
      reason: "최근 5건의 요청에서 반복 관찰됨",
    }, context);
    expect(result.success).toBe(true);
    expect(rows).toHaveLength(1);
    expect(rows[0].memory_type).toBe("rule_candidate");

    // resolveExecutionPolicy가 이걸 인식하지 못해 아무 효과가 없어야 한다.
    const policy = resolveExecutionPolicy(rows as unknown as OliviaMemoryRow[]);
    expect(policy.autoCreateClient).toBeUndefined();
  });

  it("approve_agent_memory_rule은 제안을 실제 규칙 타입으로 승격하고 그제서야 적용된다", async () => {
    await executeMemoryTool("propose_agent_memory_rule", {
      key: "auto_create_project_for_new_client",
      scope: "quote",
      proposedType: "business_rule",
      proposedValue: JSON.stringify({ ifClientMissing: "create_client_from_request" }),
      reason: "최근 5건의 요청에서 반복 관찰됨",
    }, context);

    const approval = await executeMemoryTool("approve_agent_memory_rule", { key: "auto_create_project_for_new_client", scope: "quote" }, context);
    expect(approval.success).toBe(true);
    expect(rows[0].memory_type).toBe("business_rule");
    expect(rows[0].is_active).toBe(true);

    const policy = resolveExecutionPolicy(rows as unknown as OliviaMemoryRow[]);
    expect(policy.autoCreateClient).toBe(true);
  });

  it("아직 제안되지 않은 key를 승인하려 하면 실패한다", async () => {
    await expect(executeMemoryTool("approve_agent_memory_rule", { key: "no_such_rule", scope: null }, context))
      .rejects.toThrow("찾지 못했어요");
  });

  it("이미 확정된 규칙(rule_candidate가 아님)을 다시 승인하려 하면 실패한다", async () => {
    await executeMemoryTool("save_agent_memory", {
      memoryType: "business_rule", key: "already_confirmed", scope: null, value: JSON.stringify({ a: 1 }), priority: 50,
    }, context);
    await expect(executeMemoryTool("approve_agent_memory_rule", { key: "already_confirmed", scope: null }, context))
      .rejects.toThrow("승인 대기 중인 규칙 후보가 아니에요");
  });
});
