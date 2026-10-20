import { describe, expect, it } from "vitest";
import {
  ACTIVE_WORKFLOW_STEP_KEYS,
  ACTIVE_WORKFLOW_STEPS,
  getWorkflowDisplayStepKey,
  WORKFLOW_STEPS,
} from "@/lib/workflow";

describe("v25 고객 워크플로우", () => {
  it("전체 호환 카탈로그 18개는 유지하고 활성 바는 12개만 그린다", () => {
    expect(WORKFLOW_STEPS).toHaveLength(18);
    expect(ACTIVE_WORKFLOW_STEPS).toHaveLength(12);
    expect(ACTIVE_WORKFLOW_STEP_KEYS).not.toContain("consult_meeting");
    expect(ACTIVE_WORKFLOW_STEP_KEYS).toContain("raw_matching");
  });

  it("상담 단계에 머문 옛 실행 건은 견적 단계로 표시한다", () => {
    expect(getWorkflowDisplayStepKey("consult_meeting")).toBe("quote");
    expect(getWorkflowDisplayStepKey("customer_care")).toBe("reward");
    expect(getWorkflowDisplayStepKey("content_planning")).toBe("reward");
  });

  it("RAW 승인은 고객 셀렉과 보정 사이의 독립 활성 단계다", () => {
    const selectionIndex = ACTIVE_WORKFLOW_STEP_KEYS.indexOf("client_selection");
    expect(ACTIVE_WORKFLOW_STEP_KEYS[selectionIndex + 1]).toBe("raw_matching");
    expect(ACTIVE_WORKFLOW_STEP_KEYS[selectionIndex + 2]).toBe("retouching");
  });
});
