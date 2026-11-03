import { describe, expect, it, vi } from "vitest";
import { resolveDocumentWorkflowRunId, resolveWorkflowRunId } from "@/lib/workflowRunLookup";

type WorkflowRunRow = { id: string; client_id: string | null; status?: string; created_at?: string };

function dbFor(rows: WorkflowRunRow[]) {
  return {
    from(table: string) {
      if (table !== "workflow_runs") throw new Error(`unexpected table: ${table}`);
      const filters: Record<string, unknown> = {};
      const query = {
        select: vi.fn(() => query),
        eq: vi.fn((column: string, value: unknown) => {
          filters[column] = value;
          return query;
        }),
        order: vi.fn(() => query),
        limit: vi.fn(() => query),
        maybeSingle: vi.fn(async () => ({
          data: rows.find((row) => Object.entries(filters).every(([key, value]) => row[key as keyof WorkflowRunRow] === value)) ?? null,
          error: null,
        })),
      };
      return query;
    },
  };
}

describe("resolveWorkflowRunId", () => {
  it("uses an existing requested workflow run for the same client", async () => {
    const db = dbFor([{ id: "run-1", client_id: "client-1", status: "active" }]);
    await expect(resolveWorkflowRunId(db as never, "run-1", "client-1")).resolves.toBe("run-1");
  });

  it("falls back to the client's active run when the requested run no longer exists", async () => {
    const db = dbFor([{ id: "run-active", client_id: "client-1", status: "active" }]);
    await expect(resolveWorkflowRunId(db as never, "run-deleted", "client-1")).resolves.toBe("run-active");
  });

  it("does not attach a stale missing run when there is no client context", async () => {
    const db = dbFor([]);
    await expect(resolveWorkflowRunId(db as never, "run-deleted", null)).resolves.toBeNull();
  });

  it("does not attach another client's requested run", async () => {
    const db = dbFor([
      { id: "run-other", client_id: "client-2", status: "active" },
      { id: "run-own", client_id: "client-1", status: "active" },
    ]);
    await expect(resolveWorkflowRunId(db as never, "run-other", "client-1")).resolves.toBe("run-own");
  });
});

describe("resolveDocumentWorkflowRunId", () => {
  it("촬영 건을 생략하면 활성 촬영 건을 추측하지 않고 null을 유지한다", async () => {
    const db = dbFor([{ id: "run-active", client_id: "client-1", status: "active" }]);
    await expect(resolveDocumentWorkflowRunId(db as never, undefined, "client-1")).resolves.toBeNull();
  });

  it("명시한 촬영 건이 선택 고객 소유일 때만 허용한다", async () => {
    const db = dbFor([{ id: "run-1", client_id: "client-1", status: "active" }]);
    await expect(resolveDocumentWorkflowRunId(db as never, "run-1", "client-1")).resolves.toBe("run-1");
    await expect(resolveDocumentWorkflowRunId(db as never, "run-1", "client-2")).rejects.toThrow("소유");
  });

  it("없는 촬영 건을 다른 활성 촬영 건으로 대체하지 않는다", async () => {
    const db = dbFor([{ id: "run-active", client_id: "client-1", status: "active" }]);
    await expect(resolveDocumentWorkflowRunId(db as never, "run-missing", "client-1")).rejects.toThrow("찾을 수 없습니다");
  });
});
