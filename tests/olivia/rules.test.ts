import { describe, expect, it } from "vitest";
import { evaluateOliviaRules } from "@/lib/olivia/rules";
import type { OliviaWorkflowContext } from "@/lib/olivia/types";

const NOW = new Date("2026-07-18T03:00:00.000Z");
const ago = (hours: number) => new Date(NOW.getTime() - hours * 60 * 60 * 1_000).toISOString();

function context(overrides: Partial<OliviaWorkflowContext> = {}): OliviaWorkflowContext {
  return {
    workflowRun: { id: "run-1", client_id: "client-1", client_name: "테스트의원", status: "active", current_step_key: "quote", next_action: "견적 확인", updated_at: ago(1), preparation_data: {}, work_progress: {} },
    client: { id: "client-1" }, project: null, currentStep: { key: "quote", name: "견적서 생성 / 전달" },
    stepRuns: [], tasks: [], approvals: [], mailing: [], consultationMemos: [], commitments: [], quotes: [], contracts: [], galleries: [], revisions: [], rewards: [], reviews: [], recentAgentLogs: [], recentEvents: [], unavailableSources: [], now: NOW.toISOString(),
    ...overrides,
  };
}

describe("Olivia deterministic observer rules", () => {
  it("detects approval waiting for 24 hours", () => {
    const rules = evaluateOliviaRules(context({ approvals: [{ id: "approval-1", title: "견적 승인", status: "pending", created_at: ago(25), workflow_step_key: "quote" }] }));
    expect(rules.some((rule) => rule.ruleId === "RULE_01_APPROVAL_WAITING")).toBe(true);
  });
  it("detects an abandoned failed task", () => {
    const rules = evaluateOliviaRules(context({ tasks: [{ id: "task-1", title: "견적 생성", task_type: "quote", status: "failed", updated_at: ago(2), retry_count: 1, error_message: "timeout", workflow_step_key: "quote" }] }));
    expect(rules.find((rule) => rule.ruleId === "RULE_02_FAILED_TASK")?.deduplicationKey).toBe("failed_task:task-1:1");
  });
  it("detects quote customer inactivity only after delivery evidence", () => {
    const rules = evaluateOliviaRules(context({
      approvals: [{ id: "approval-1", status: "approved", workflow_step_key: "quote" }],
      mailing: [{ id: "mail-1", status: "sent", workflow_step_key: "quote", sent_at: ago(96) }],
    }));
    expect(rules.some((rule) => rule.ruleId === "RULE_04_CUSTOMER_WAITING")).toBe(true);
  });
  it("raises a D-1 shooting preparation risk", () => {
    const rules = evaluateOliviaRules(context({ workflowRun: { id: "run-1", client_id: "client-1", client_name: "테스트의원", status: "active", current_step_key: "shooting", next_action: "촬영 준비", updated_at: ago(1), shoot_date: "2026-07-19", preparation_data: {}, work_progress: {} } }));
    expect(rules.some((rule) => rule.ruleId === "RULE_07_SHOOTING_D1")).toBe(true);
  });
  it("detects commitments due soon and overdue", () => {
    const rules = evaluateOliviaRules(context({ commitments: [
      { id: "c1", status: "open", owner_type: "representative", commitment: "자료 전달", due_at: new Date(NOW.getTime() + 2 * 60 * 60 * 1_000).toISOString() },
      { id: "c2", status: "open", owner_type: "client", commitment: "명단 전달", due_at: ago(2) },
    ] }));
    expect(rules.some((rule) => rule.ruleId === "RULE_08_COMMITMENT_DUE")).toBe(true);
    expect(rules.some((rule) => rule.ruleId === "RULE_09_COMMITMENT_OVERDUE")).toBe(true);
  });
  it("detects a stalled workflow and an advance candidate", () => {
    const rules = evaluateOliviaRules(context({ workflowRun: { id: "run-1", client_id: "client-1", client_name: "테스트의원", status: "active", current_step_key: "contract", next_action: "계약 확인", updated_at: ago(24 * 5), preparation_data: {}, work_progress: {} }, currentStep: { key: "contract", name: "계약" } }));
    expect(rules.some((rule) => rule.ruleId === "RULE_10_WORKFLOW_STALLED")).toBe(true);
    expect(rules.some((rule) => rule.ruleId === "RULE_11_CAN_ADVANCE")).toBe(true);
  });
  it("does not create a marketing opportunity without public consent", () => {
    const rules = evaluateOliviaRules(context({ reviews: [{ id: "review-1", overall_rating: 5, allow_public_use: false }] }));
    expect(rules.some((rule) => rule.ruleId === "RULE_15_REVIEW_OPPORTUNITY")).toBe(false);
  });
});
