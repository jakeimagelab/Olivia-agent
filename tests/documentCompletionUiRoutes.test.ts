import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function source(relativePath: string) {
  return fs.readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

describe("document final completion UI routes", () => {
  it("ContractBuilder uses the contract-aware complete route and keeps portal publish separate", () => {
    const contractBuilder = source("components/contract/ContractBuilder.tsx");

    expect(contractBuilder).toContain("/api/contracts/${savedContractId}/complete");
    expect(contractBuilder).toContain("/api/contracts/${savedContractId}/publish");
    expect(contractBuilder).not.toContain("/api/workflow-runs/${workflowRunId}/complete-step");
    expect(contractBuilder).toContain("useCoreProjectSnapshot(linkedWorkflowRunId)");
    expect(contractBuilder).toContain("isContractCoreCompleted(coreSnapshot, contractDocumentId)");
    expect(contractBuilder).toContain("refreshCoreSnapshot");
    expect(contractBuilder).toContain("notifyCoreSnapshotUpdated(workflowRunId)");
    expect(contractBuilder).toContain("canComplete,");
    expect(contractBuilder).toContain("canPublish: Boolean(contractDocumentId)");
    expect(contractBuilder).toContain('disabled={completeState === "completing" || contractCoreCompleted}');
  });

  it("ContiEditorWorkspace uses the conti-aware complete route instead of generic completion", () => {
    const contiWorkspace = source("components/conti/v2/ContiEditorWorkspace.tsx");

    expect(contiWorkspace).toContain("/api/conti/runs/${activeDocument.run.id}/complete");
    expect(contiWorkspace).not.toContain("/api/workflow-runs/${activeWorkflowRunId}/complete-step");
    expect(contiWorkspace).toContain("useCoreProjectSnapshot(activeWorkflowRunId)");
    expect(contiWorkspace).toContain("isContiCoreCompleted(coreSnapshot, activeContiId)");
    expect(contiWorkspace).toContain('disabled={completeState === "completing" || contiCoreCompleted}');
    expect(contiWorkspace).toContain("notifyCoreSnapshotUpdated(activeWorkflowRunId)");
  });

  it("chat completion executors call the same Core commands instead of portal publish", () => {
    const contractExecutor = source("lib/olivia/v2/toolExecutors/contract.ts");
    const contiExecutor = source("lib/olivia/v2/toolExecutors/contiV2.ts");

    expect(contractExecutor).toContain("completeContract(resourceId");
    expect(contiExecutor).toContain("completeConti(runId");
    expect(contractExecutor).toContain('if (name === "complete_contract")');
    expect(contiExecutor).toContain('if (name === "complete_conti_v2")');
  });

  it("invalidates the matching Core Snapshot after chat completes a document", () => {
    const conversationStore = source("lib/store/useOliviaConversationStore.ts");

    expect(conversationStore).toContain('event.tool === "complete_contract" || event.tool === "complete_conti_v2"');
    expect(conversationStore).toContain("notifyCoreSnapshotUpdated(completion.workflowRunId)");
  });
});
