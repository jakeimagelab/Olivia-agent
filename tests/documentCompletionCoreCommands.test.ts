import { beforeEach, describe, expect, it, vi } from "vitest";

const dependencies = vi.hoisted(() => ({
  snapshot: vi.fn(),
  advance: vi.fn(),
  completeTasks: vi.fn(),
  recordActivity: vi.fn(),
}));

vi.mock("@/lib/core/readModels/projectSnapshot", () => ({
  getCoreProjectSnapshot: dependencies.snapshot,
}));
vi.mock("@/lib/workflowAutomation", () => ({
  completeOpenStepTasksForManualSave: dependencies.completeTasks,
  maybeAdvanceWorkflow: dependencies.advance,
}));
vi.mock("@/lib/pcrm/activity", () => ({
  recordPcrmActivitySafely: dependencies.recordActivity,
}));
vi.mock("@/lib/quote/quoteWorkflowLink", () => ({ resolveQuoteWorkflowLink: vi.fn() }));
vi.mock("@/lib/clientPortal", () => ({ ensurePortalAccess: vi.fn(), logPortalEvent: vi.fn() }));
vi.mock("@/lib/contract/contractDocument", () => ({ normalizeContractQuoteData: vi.fn() }));
vi.mock("@/lib/publications/publishResource", () => ({
  publishQuoteService: vi.fn(),
  publishContractService: vi.fn(),
}));

type Row = Record<string, unknown>;
type Tables = Record<string, Row[]>;

class MemoryQuery {
  private filters: Array<[string, unknown]> = [];
  private operation: "select" | "update" = "select";
  private patch: Row = {};

  constructor(private readonly tables: Tables, private readonly table: string) {}

  select() { return this; }
  eq(column: string, value: unknown) { this.filters.push([column, value]); return this; }
  update(patch: Row) { this.operation = "update"; this.patch = patch; return this; }

  private execute() {
    const row = (this.tables[this.table] ?? []).find((candidate) =>
      this.filters.every(([key, value]) => candidate[key] === value),
    ) ?? null;
    if (row && this.operation === "update") Object.assign(row, this.patch);
    return row ? { ...row } : null;
  }

  async maybeSingle() { return { data: this.execute(), error: null }; }
  async single() { return { data: this.execute(), error: null }; }
}

function memoryDb(tables: Tables) {
  return {
    tables,
    from(table: string) { return new MemoryQuery(tables, table); },
  };
}

function snapshot(input: {
  step: string;
  contract?: { id: string; status: string } | null;
  conti?: { id: string } | null;
}) {
  const stepNames: Record<string, string> = {
    contract: "계약서 작성 / 전달",
    conti: "콘티 작성 / 전달",
    shooting: "촬영",
    retouching: "보정",
  };
  return {
    ok: true,
    value: {
      workflow: { currentStep: input.step, currentStepName: stepNames[input.step] ?? input.step },
      resources: {
        contract: input.contract === undefined
          ? { id: "contract-1", status: "draft" }
          : input.contract,
        conti: input.conti === undefined ? { id: "conti-1" } : input.conti,
      },
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  dependencies.completeTasks.mockResolvedValue(undefined);
  dependencies.recordActivity.mockResolvedValue(undefined);
  dependencies.advance.mockResolvedValue({
    advanced: true,
    result: { to_step_key: "conti" },
  });
});

describe("completeContract", () => {
  it("finalizes the exact current contract and advances only to conti", async () => {
    const db = memoryDb({
      contracts: [{ id: "contract-1", status: "draft", client_id: "client-1", workflow_run_id: "run-1" }],
      pcrm_publications: [],
    });
    dependencies.snapshot
      .mockResolvedValueOnce(snapshot({ step: "contract" }))
      .mockResolvedValueOnce(snapshot({ step: "conti", contract: { id: "contract-1", status: "final" } }));
    const { completeContract } = await import("@/lib/core/commands/document");

    const result = await completeContract("contract-1", { workflowRunId: "run-1" }, db as never);

    expect(result).toMatchObject({
      ok: true,
      value: { contractId: "contract-1", workflowRunId: "run-1", status: "final", advanced: true, currentStep: "conti", currentStepName: "콘티 작성 / 전달" },
    });
    expect(db.tables.contracts[0].status).toBe("final");
    expect(db.tables.pcrm_publications).toHaveLength(0);
    expect(dependencies.completeTasks).toHaveBeenCalledWith(db, "run-1", "contract");
  });

  it("rejects a workflowRunId from another project without mutating", async () => {
    const db = memoryDb({
      contracts: [{ id: "contract-1", status: "draft", client_id: "client-1", workflow_run_id: "run-1" }],
    });
    const { completeContract } = await import("@/lib/core/commands/document");

    const result = await completeContract("contract-1", { workflowRunId: "run-2" }, db as never);

    expect(result).toMatchObject({ ok: false, code: "RESOURCE_PROJECT_MISMATCH" });
    expect(db.tables.contracts[0].status).toBe("draft");
    expect(dependencies.snapshot).not.toHaveBeenCalled();
    expect(dependencies.advance).not.toHaveBeenCalled();
  });

  it("rejects an old contract when the snapshot points to another contract", async () => {
    const db = memoryDb({
      contracts: [{ id: "contract-old", status: "draft", client_id: "client-1", workflow_run_id: "run-1" }],
    });
    dependencies.snapshot.mockResolvedValueOnce(snapshot({
      step: "contract",
      contract: { id: "contract-current", status: "draft" },
    }));
    const { completeContract } = await import("@/lib/core/commands/document");

    const result = await completeContract("contract-old", {}, db as never);

    expect(result).toMatchObject({ ok: false, code: "RESOURCE_MISMATCH" });
    expect(dependencies.advance).not.toHaveBeenCalled();
  });

  it("surfaces open contract work as a blocking failure", async () => {
    const db = memoryDb({
      contracts: [{ id: "contract-1", status: "draft", client_id: "client-1", workflow_run_id: "run-1" }],
    });
    dependencies.snapshot.mockResolvedValueOnce(snapshot({ step: "contract" }));
    dependencies.advance.mockResolvedValueOnce({ advanced: false, reason: "open_items" });
    const { completeContract } = await import("@/lib/core/commands/document");

    const result = await completeContract("contract-1", {}, db as never);

    expect(result).toMatchObject({ ok: false, code: "WORKFLOW_BLOCKED" });
    expect(db.tables.contracts[0].status).toBe("draft");
  });

  it("returns idempotently when the exact final contract is already past contract", async () => {
    const db = memoryDb({
      contracts: [{ id: "contract-1", status: "final", client_id: "client-1", workflow_run_id: "run-1" }],
    });
    dependencies.snapshot.mockResolvedValueOnce(snapshot({
      step: "shooting",
      contract: { id: "contract-1", status: "final" },
    }));
    const { completeContract } = await import("@/lib/core/commands/document");

    const result = await completeContract("contract-1", {}, db as never);

    expect(result).toMatchObject({ ok: true, idempotent: true, value: { advanced: false, status: "final", currentStep: "shooting", currentStepName: "촬영" } });
    expect(dependencies.advance).not.toHaveBeenCalled();
  });
});

describe("completeConti", () => {
  it("completes the exact canonical conti without creating a portal publication", async () => {
    const db = memoryDb({
      conti_runs: [{ id: "conti-1", hospital_id: "client-1", workflow_run_id: "run-1" }],
      conti_saves: [],
      pcrm_publications: [],
    });
    dependencies.advance.mockResolvedValueOnce({ advanced: true, result: { to_step_key: "shooting" } });
    dependencies.snapshot
      .mockResolvedValueOnce(snapshot({ step: "conti" }))
      .mockResolvedValueOnce(snapshot({ step: "shooting" }));
    const { completeConti } = await import("@/lib/core/commands/document");

    const result = await completeConti("conti-1", { workflowRunId: "run-1" }, db as never);

    expect(result).toMatchObject({ ok: true, value: { contiId: "conti-1", workflowRunId: "run-1", advanced: true, currentStep: "shooting", currentStepName: "촬영" } });
    expect(db.tables.pcrm_publications).toHaveLength(0);
    expect(dependencies.completeTasks).toHaveBeenCalledWith(db, "run-1", "conti");
  });

  it("rejects a conti from another project", async () => {
    const db = memoryDb({
      conti_runs: [{ id: "conti-1", hospital_id: "client-1", workflow_run_id: "run-1" }],
      conti_saves: [],
    });
    const { completeConti } = await import("@/lib/core/commands/document");

    const result = await completeConti("conti-1", { workflowRunId: "run-2" }, db as never);

    expect(result).toMatchObject({ ok: false, code: "RESOURCE_PROJECT_MISMATCH" });
    expect(dependencies.advance).not.toHaveBeenCalled();
  });

  it("rejects an old conti when the snapshot points to another conti", async () => {
    const db = memoryDb({
      conti_runs: [{ id: "conti-old", hospital_id: "client-1", workflow_run_id: "run-1" }],
      conti_saves: [],
    });
    dependencies.snapshot.mockResolvedValueOnce(snapshot({ step: "conti", conti: { id: "conti-current" } }));
    const { completeConti } = await import("@/lib/core/commands/document");

    const result = await completeConti("conti-old", {}, db as never);

    expect(result).toMatchObject({ ok: false, code: "RESOURCE_MISMATCH" });
    expect(dependencies.advance).not.toHaveBeenCalled();
  });

  it("completes an exact legacy conti_saves row linked by workflow_run_id", async () => {
    const db = memoryDb({
      conti_runs: [],
      conti_saves: [{ id: "legacy-1", client_id: "client-1", workflow_run_id: "run-1", title: "이전 콘티" }],
    });
    dependencies.advance.mockResolvedValueOnce({ advanced: true, result: { to_step_key: "shooting" } });
    dependencies.snapshot
      .mockResolvedValueOnce(snapshot({ step: "conti", conti: { id: "legacy-1" } }))
      .mockResolvedValueOnce(snapshot({ step: "shooting", conti: { id: "legacy-1" } }));
    const { completeConti } = await import("@/lib/core/commands/document");

    const result = await completeConti("legacy-1", {}, db as never);

    expect(result).toMatchObject({ ok: true, value: { contiId: "legacy-1", workflowRunId: "run-1" } });
  });

  it("blocks legacy conti rows without workflow_run_id instead of using hospital_name", async () => {
    const db = memoryDb({
      conti_runs: [],
      conti_saves: [{ id: "legacy-1", client_id: "client-1", workflow_run_id: null, title: "기통찬의원 콘티" }],
    });
    const { completeConti } = await import("@/lib/core/commands/document");

    const result = await completeConti("legacy-1", {}, db as never);

    expect(result).toMatchObject({ ok: false, code: "BLOCKED" });
    expect(dependencies.snapshot).not.toHaveBeenCalled();
  });

  it("returns idempotently after shooting when the current conti is unchanged", async () => {
    const db = memoryDb({
      conti_runs: [{ id: "conti-1", hospital_id: "client-1", workflow_run_id: "run-1" }],
      conti_saves: [],
    });
    dependencies.snapshot.mockResolvedValueOnce(snapshot({ step: "retouching" }));
    const { completeConti } = await import("@/lib/core/commands/document");

    const result = await completeConti("conti-1", {}, db as never);

    expect(result).toMatchObject({ ok: true, idempotent: true, value: { advanced: false, currentStep: "retouching", currentStepName: "보정" } });
    expect(dependencies.advance).not.toHaveBeenCalled();
  });
});
