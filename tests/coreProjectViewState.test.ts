import { describe, expect, it } from "vitest";
import {
  isContractCoreCompleted,
  isContiCoreCompleted,
  isWorkflowPastStep,
} from "@/lib/core/readModels/projectViewState";
import type { CoreProjectSnapshot } from "@/lib/core/readModels/types";

function projectSnapshot(input: {
  currentStep: string;
  completedSteps?: string[];
  contract?: { id: string; status: string } | null;
  conti?: { id: string } | null;
}): CoreProjectSnapshot {
  return {
    client: { id: "client-1", name: "테스트의원" },
    project: { workflowRunId: "run-1", projectId: null, name: "테스트", status: "active" },
    workflow: {
      currentStep: input.currentStep,
      currentStepName: input.currentStep,
      completedSteps: input.completedSteps ?? [],
      stepStates: [],
      nextStep: null,
      progressPercent: 0,
    },
    resources: {
      quote: null,
      contract: input.contract
        ? { type: "contract", workflowRunId: "run-1", clientId: "client-1", ...input.contract }
        : null,
      conti: input.conti
        ? { type: "conti", workflowRunId: "run-1", clientId: "client-1", ...input.conti }
        : null,
      photoProject: null,
      selectGallery: null,
      photoGallery: null,
    },
    nextAction: {},
    consistency: { ok: true, issues: [] },
    generatedAt: "2026-09-26T00:00:00.000Z",
  };
}

describe("Core Project Snapshot view state", () => {
  it("keeps a draft contract incomplete on the contract step", () => {
    const snapshot = projectSnapshot({ currentStep: "contract", contract: { id: "contract-1", status: "draft" } });
    expect(isContractCoreCompleted(snapshot, "contract-1")).toBe(false);
  });

  it("recognizes an exact final contract after advancing to conti", () => {
    const snapshot = projectSnapshot({ currentStep: "conti", contract: { id: "contract-1", status: "final" } });
    expect(isContractCoreCompleted(snapshot, "contract-1")).toBe(true);
  });

  it("keeps an exact final contract completed at later workflow steps", () => {
    const snapshot = projectSnapshot({ currentStep: "shooting", contract: { id: "contract-1", status: "final" } });
    expect(isWorkflowPastStep(snapshot, "contract")).toBe(true);
    expect(isContractCoreCompleted(snapshot, "contract-1")).toBe(true);
  });

  it("does not mark a different contract complete even at a later step", () => {
    const snapshot = projectSnapshot({ currentStep: "shooting", contract: { id: "contract-current", status: "final" } });
    expect(isContractCoreCompleted(snapshot, "contract-old")).toBe(false);
  });

  it("keeps the current exact conti incomplete while still on conti", () => {
    const snapshot = projectSnapshot({ currentStep: "conti", conti: { id: "conti-1" } });
    expect(isContiCoreCompleted(snapshot, "conti-1")).toBe(false);
  });

  it("recognizes the exact conti after advancing to shooting", () => {
    const snapshot = projectSnapshot({ currentStep: "shooting", conti: { id: "conti-1" } });
    expect(isContiCoreCompleted(snapshot, "conti-1")).toBe(true);
  });

  it("does not mark another conti complete after advancing", () => {
    const snapshot = projectSnapshot({ currentStep: "shooting", conti: { id: "conti-current" } });
    expect(isContiCoreCompleted(snapshot, "conti-old")).toBe(false);
  });
});
