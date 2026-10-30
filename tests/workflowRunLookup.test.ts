import { describe, expect, it, vi } from "vitest";
import { resolveWorkflowRunId } from "@/lib/workflowRunLookup";

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
