import { describe, expect, it } from "vitest";
import { getWorkflowStepProgress } from "@/lib/workflow";
import { buildWorkflowNextAction } from "@/lib/workflowNextAction";

describe("completed workflow display state", () => {
  it("always reports 100 percent even when a legacy row points at an earlier step", () => {
    expect(getWorkflowStepProgress("payment_confirm", "completed")).toBe(100);
  });

  it("returns a completed next action for a legacy completed run", () => {
    const action = buildWorkflowNextAction({
      run: {
        id: "run-completed",
        client_id: "client-1",
        current_step_key: "payment_confirm",
        status: "completed",
      },
      tasks: [],
      approvals: [],
      mailing: [],
    });

    expect(action.progress).toBe(100);
    expect(action.primaryAction).toBe("completed");
    expect(action.label).toBe("워크플로우가 완료되었습니다.");
  });
});
