import { describe, expect, it } from "vitest";
import { COMPLETABLE_STEP_KEYS } from "@/lib/workflow/completableSteps";
import { ACTIVE_WORKFLOW_STEP_KEYS } from "@/lib/workflow";

describe("workflow complete-step policy", () => {
  it("12단계 전부 완료 처리할 수 있다", () => {
    for (const key of ACTIVE_WORKFLOW_STEP_KEYS) {
      expect(COMPLETABLE_STEP_KEYS.has(key)).toBe(true);
    }
  });
});
