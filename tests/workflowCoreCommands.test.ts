import { beforeEach, describe, expect, it, vi } from "vitest";

const events = vi.hoisted(() => ({ emit: vi.fn() }));

vi.mock("@/lib/olivia/events", () => ({
  createEventDeduplicationKey: (...parts: string[]) => parts.join(":"),
  emitOliviaEvent: events.emit,
  emitOliviaEventSafely: vi.fn(),
}));

type WorkflowRow = {
  id: string;
  status: string;
  client_id: string | null;
  project_id: string | null;
};

function workflowDb(initial: WorkflowRow) {
  const row = { ...initial };
  return {
    row,
    from(table: string) {
      if (table !== "workflow_runs") throw new Error(`unexpected table: ${table}`);
      return {
        select: () => ({
          eq: () => ({ single: async () => ({ data: { ...row }, error: null }) }),
        }),
        update: (patch: Record<string, unknown>) => ({
          eq: () => ({
            eq: (_column: string, expectedStatus: string) => ({
              select: () => ({
                maybeSingle: async () => {
                  if (row.status !== expectedStatus) return { data: null, error: null };
                  Object.assign(row, patch);
                  return { data: { id: row.id }, error: null };
                },
              }),
            }),
          }),
        }),
      };
    },
  };
}

beforeEach(() => events.emit.mockReset().mockResolvedValue({ id: "event-1" }));

describe("workflow Core commands", () => {
  it("cancels an active workflow and records the required event", async () => {
    const db = workflowDb({ id: "run-1", status: "active", client_id: "client-1", project_id: "project-1" });
    const { cancelWorkflow } = await import("@/lib/workflowAutomation");
    const result = await cancelWorkflow(db as never, { workflow_run_id: "run-1", reason: "고객 삭제" });

    expect(result).toMatchObject({ ok: true, idempotent: false, value: { workflow_run_id: "run-1" } });
    expect(db.row.status).toBe("canceled");
    expect(events.emit).toHaveBeenCalledWith(db, expect.objectContaining({
      eventType: "workflow.canceled",
      workflowRunId: "run-1",
      clientId: "client-1",
      projectId: "project-1",
    }));
  });

  it("returns explicit idempotent success without duplicating the event", async () => {
    const db = workflowDb({ id: "run-2", status: "canceled", client_id: null, project_id: null });
    const { cancelWorkflow } = await import("@/lib/workflowAutomation");
    const result = await cancelWorkflow(db as never, { workflow_run_id: "run-2" });

    expect(result).toMatchObject({ ok: true, idempotent: true, value: { workflow_run_id: "run-2" } });
    expect(events.emit).not.toHaveBeenCalled();
  });

  it("rejects an invalid transition without changing the workflow", async () => {
    const db = workflowDb({ id: "run-3", status: "completed", client_id: null, project_id: null });
    const { cancelWorkflow } = await import("@/lib/workflowAutomation");
    const result = await cancelWorkflow(db as never, { workflow_run_id: "run-3" });

    expect(result).toMatchObject({ ok: false, code: "INVALID_STATE" });
    expect(db.row.status).toBe("completed");
    expect(events.emit).not.toHaveBeenCalled();
  });
});
