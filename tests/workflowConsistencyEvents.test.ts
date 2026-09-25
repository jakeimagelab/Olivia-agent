import { describe, expect, it } from "vitest";
import { hasWorkflowMutationEventNear } from "@/lib/workflowAutomation";

describe("workflow consistency event matching", () => {
  const updatedAt = "2026-09-25T01:00:00.000Z";

  it("matches a workflow event inside the five second window", () => {
    expect(hasWorkflowMutationEventNear("run-1", updatedAt, [{
      workflow_run_id: "run-1",
      event_type: "workflow.step_changed",
      occurred_at: "2026-09-25T01:00:04.500Z",
    }])).toBe(true);
  });

  it("rejects another run, another event type, or a stale event", () => {
    expect(hasWorkflowMutationEventNear("run-1", updatedAt, [
      { workflow_run_id: "run-2", event_type: "workflow.step_changed", occurred_at: updatedAt },
      { workflow_run_id: "run-1", event_type: "agent.task_completed", occurred_at: updatedAt },
      { workflow_run_id: "run-1", event_type: "workflow.completed", occurred_at: "2026-09-25T01:00:05.001Z" },
    ])).toBe(false);
  });
});
