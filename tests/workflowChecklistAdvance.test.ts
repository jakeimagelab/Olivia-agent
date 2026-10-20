import { describe, expect, it } from "vitest";
import { advanceWorkflow } from "@/lib/workflowAutomation";

describe("advanceWorkflow checklist compatibility", () => {
  it("does not overwrite a current step derived from stored checks", async () => {
    const run: Record<string, unknown> = {
      id: "run-1",
      current_step_key: "quote",
      status: "active",
      checks: {
        quote_sent: { done: false, by: "auto" },
        client_portal: { done: true, by: "auto", at: "2026-10-20T00:00:00.000Z" },
      },
    };
    const db = {
      from(table: string) {
        if (table !== "workflow_runs") throw new Error(`unexpected table: ${table}`);
        return {
          select() {
            return { eq: () => ({ single: async () => ({ data: { ...run }, error: null }) }) };
          },
          update(patch: Record<string, unknown>) {
            Object.assign(run, patch);
            return {
              eq() {
                return {
                  select() {
                    return { single: async () => ({ data: { ...run }, error: null }) };
                  },
                };
              },
            };
          },
        };
      },
    };

    const result = await advanceWorkflow(db as never, {
      workflow_run_id: "run-1",
      from_step_key: "quote",
      to_step_key: "contract",
      reason: "legacy automation",
    });

    expect(result).toMatchObject({ checklist_managed: true, to_step_key: "quote", created: [] });
    expect(run.current_step_key).toBe("quote");
    expect(run.next_action).toBe("견적서를 만들어 고객에게 보내기");
  });
});
