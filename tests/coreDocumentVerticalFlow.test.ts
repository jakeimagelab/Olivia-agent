import { beforeEach, describe, expect, it, vi } from "vitest";
import { memorySupabase, type MemoryTables } from "./helpers/memorySupabase";

const dependencies = vi.hoisted(() => ({
  completeTasks: vi.fn(),
  advance: vi.fn(),
  link: vi.fn(),
  logPortalEvent: vi.fn(),
  recordActivity: vi.fn(),
  normalize: vi.fn(),
  publishContractService: vi.fn(),
}));

vi.mock("@/lib/workflowAutomation", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/workflowAutomation")>(),
  completeOpenStepTasksForManualSave: dependencies.completeTasks,
  maybeAdvanceWorkflow: dependencies.advance,
}));
vi.mock("@/lib/quote/quoteWorkflowLink", () => ({ resolveQuoteWorkflowLink: dependencies.link }));
vi.mock("@/lib/clientPortal", () => ({
  ensurePortalAccess: vi.fn(async () => ({ token: "portal-token" })),
  logPortalEvent: dependencies.logPortalEvent,
}));
vi.mock("@/lib/pcrm/activity", () => ({ recordPcrmActivitySafely: dependencies.recordActivity }));
vi.mock("@/lib/contract/contractDocument", () => ({ normalizeContractQuoteData: dependencies.normalize }));
vi.mock("@/lib/publications/publishResource", () => ({
  publishQuoteService: vi.fn(),
  publishContractService: dependencies.publishContractService,
}));

function verticalTables(): MemoryTables {
  return {
    workflow_runs: [{
      id: "run-1", client_id: "client-1", project_id: null, client_name: "기통찬의원",
      project_name: "2026 촬영", current_step_key: "quote", status: "active",
      created_at: "2026-09-25T00:00:00Z", updated_at: "2026-09-25T00:00:00Z",
    }],
    clients: [{ id: "client-1", hospital_name: "기통찬의원" }],
    workflow_step_runs: [], agent_tasks: [], agent_approvals: [], mailing_queue: [],
    quotes: [{
      id: "quote-1", status: "draft", client_id: "client-1", workflow_run_id: "run-1",
      hospital_name: "기통찬의원", quote_number: "Q-1", created_at: "2026-09-25T00:00:00Z",
    }],
    contracts: [], conti_runs: [], conti_saves: [], photo_storage_projects: [], select_galleries: [], photo_galleries: [],
    pcrm_publications: [],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  dependencies.link.mockResolvedValue({ status: "linked", clientId: "client-1", workflowRunId: "run-1" });
  dependencies.completeTasks.mockResolvedValue(undefined);
  dependencies.logPortalEvent.mockResolvedValue({ id: "event-1" });
  dependencies.recordActivity.mockResolvedValue(undefined);
  dependencies.normalize.mockReturnValue({ hospitalName: "기통찬의원", depositRate: 50 });
  dependencies.advance.mockImplementation(async (db: any, workflowRunId: string, step: string) => {
    const next = step === "quote" ? "contract" : step === "contract" ? "conti" : step === "conti" ? "shooting" : step;
    const run = db.tables.workflow_runs.find((row: any) => row.id === workflowRunId);
    if (run) run.current_step_key = next;
    return { advanced: true, toStep: next };
  });
  dependencies.publishContractService.mockImplementation(async (contractId: string, _overrides: unknown, db: any) => {
    const contract = db.tables.contracts.find((row: any) => row.id === contractId);
    contract.status = "final";
    db.tables.workflow_runs[0].current_step_key = "conti";
    return {
      ok: true, clientId: "client-1", workflowRunId: "run-1", portalUrl: "/portal",
      publicationId: "contract-publication", resource: { ...contract }, advanced: true,
    };
  });
});

describe("Core quote → contract → conti vertical flow", () => {
  it("keeps every transition and resource visible through the canonical snapshot", async () => {
    const db = memorySupabase(verticalTables());
    const { completeQuote, createContractFromQuote, publishContract, publishConti } = await import("@/lib/core/commands/document");
    const { getCoreProjectSnapshot } = await import("@/lib/core/readModels/projectSnapshot");

    const completedQuote = await completeQuote("quote-1", {}, db as never);
    expect(completedQuote).toMatchObject({ ok: true, value: { advanced: true, status: "final" } });
    let snapshot = await getCoreProjectSnapshot("run-1", db as never);
    expect(snapshot.ok && snapshot.value.workflow.currentStep).toBe("contract");
    expect(snapshot.ok && snapshot.value.resources.quote?.id).toBe("quote-1");

    const created = await createContractFromQuote("quote-1", db as never);
    expect(created.ok).toBe(true);
    expect(created.ok && created.idempotent).not.toBe(true);
    const contractId = created.ok ? created.value.contractId : "";
    snapshot = await getCoreProjectSnapshot("run-1", db as never);
    expect(snapshot.ok && snapshot.value.resources.contract).toMatchObject({ id: contractId, sourceQuoteId: "quote-1" });

    const repeated = await createContractFromQuote("quote-1", db as never);
    expect(repeated).toMatchObject({ ok: true, idempotent: true, value: { contractId } });
    expect(db.tables.contracts).toHaveLength(1);

    const publishedContract = await publishContract(contractId, { finalize: true }, db as never);
    expect(publishedContract.ok).toBe(true);
    snapshot = await getCoreProjectSnapshot("run-1", db as never);
    expect(snapshot.ok && snapshot.value.workflow.currentStep).toBe("conti");

    db.tables.conti_runs.push({
      id: "conti-1", hospital_id: "client-1", workflow_run_id: "run-1", hospital_name: "기통찬의원",
      created_at: "2026-09-25T01:00:00Z", updated_at: "2026-09-25T01:00:00Z",
    });
    const publishedConti = await publishConti("conti-1", {
      clientId: "client-1", workflowRunId: "run-1", title: "기통찬의원 촬영 콘티",
    }, db as never);
    expect(publishedConti.ok).toBe(true);
    snapshot = await getCoreProjectSnapshot("run-1", db as never);
    expect(snapshot.ok && snapshot.value.workflow.currentStep).toBe("shooting");
    expect(snapshot.ok && snapshot.value.resources.conti).toMatchObject({ id: "conti-1", sourceTable: "conti_runs" });
  });
});
