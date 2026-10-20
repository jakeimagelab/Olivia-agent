import { describe, expect, it } from "vitest";
import {
  WORKFLOW_CHECKS,
  checksFromLegacyStep,
  deriveWorkflowPosition,
  effectiveWorkflowChecks,
  nextWorkflowCheck,
  setWorkflowCheck,
  workflowCheckProgress,
} from "@/lib/workflowChecks";

describe("workflow checklist compatibility", () => {
  it("reads an empty legacy run from current_step_key without writing data", () => {
    const checks = effectiveWorkflowChecks({ checks: {}, currentStepKey: "client_selection", status: "active" });
    expect(checks.quote_sent.done).toBe(true);
    expect(checks.sort_approved.done).toBe(true);
    expect(checks.client_selected.done).toBe(false);
    expect(nextWorkflowCheck(checks)?.key).toBe("client_selected");
  });

  it("shows legacy consult_meeting runs at the quote checklist", () => {
    const checks = checksFromLegacyStep("consult_meeting", "active");
    expect(workflowCheckProgress(checks).done).toBe(0);
    expect(deriveWorkflowPosition(checks)).toEqual({ currentStepKey: "quote", status: "active" });
  });

  it("moves current_step_key backward when a prior check is cleared", () => {
    let checks: ReturnType<typeof checksFromLegacyStep> = Object.fromEntries(WORKFLOW_CHECKS.map((item) => [item.key, { done: true, by: item.actor }]));
    checks = setWorkflowCheck({ checks, key: "conti_shared", done: false, by: "user" });
    expect(deriveWorkflowPosition(checks)).toEqual({ currentStepKey: "conti", status: "active" });
  });

  it("allows a middle check without forcing earlier checks", () => {
    const checks = setWorkflowCheck({ checks: {}, key: "payment", done: true, by: "user", at: "2026-10-20T00:00:00Z" });
    expect(checks.payment.done).toBe(true);
    expect(checks.quote_sent).toBeUndefined();
    expect(deriveWorkflowPosition(checks).currentStepKey).toBe("quote");
  });

  it("ignores custom checks when deriving the compatible stage", () => {
    const base = checksFromLegacyStep("contract", "active");
    const checks = setWorkflowCheck({ checks: base, key: "custom_a1b2c3", done: false, by: "user", label: "드론 촬영 허가" });
    expect(deriveWorkflowPosition(checks).currentStepKey).toBe("contract");
    expect(workflowCheckProgress(checks).total).toBe(WORKFLOW_CHECKS.length);
  });

  it("marks a run completed only when every fixed check is done", () => {
    const checks = Object.fromEntries(WORKFLOW_CHECKS.map((item) => [item.key, { done: true as const, by: item.actor }]));
    expect(deriveWorkflowPosition(checks)).toEqual({ currentStepKey: "reward", status: "completed" });
  });
});
