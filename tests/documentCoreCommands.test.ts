import { beforeEach, describe, expect, it, vi } from "vitest";

const dependencies = vi.hoisted(() => ({
  advance: vi.fn(),
  completeTasks: vi.fn(),
  link: vi.fn(),
  logPortalEvent: vi.fn(),
  recordActivity: vi.fn(),
  normalize: vi.fn(),
}));

vi.mock("@/lib/workflowAutomation", () => ({
  completeOpenStepTasksForManualSave: dependencies.completeTasks,
  maybeAdvanceWorkflow: dependencies.advance,
}));
vi.mock("@/lib/quote/quoteWorkflowLink", () => ({ resolveQuoteWorkflowLink: dependencies.link }));
vi.mock("@/lib/clientPortal", () => ({
  ensurePortalAccess: vi.fn(),
  logPortalEvent: dependencies.logPortalEvent,
}));
vi.mock("@/lib/pcrm/activity", () => ({ recordPcrmActivitySafely: dependencies.recordActivity }));
vi.mock("@/lib/contract/contractDocument", () => ({ normalizeContractQuoteData: dependencies.normalize }));
vi.mock("@/lib/publications/publishResource", () => ({
  publishQuoteService: vi.fn(),
  publishContractService: vi.fn(),
}));

type Row = Record<string, unknown>;
type Tables = Record<string, Row[]>;

class MemoryQuery {
  private filters: Array<[string, unknown]> = [];
  private operation: "select" | "update" | "insert" | "delete" = "select";
  private patch: Row = {};

  constructor(private readonly tables: Tables, private readonly table: string) {}

  select() { return this; }
  eq(column: string, value: unknown) { this.filters.push([column, value]); return this; }
  order() { return this; }
  limit() { return this; }
  update(patch: Row) { this.operation = "update"; this.patch = patch; return this; }
  insert(row: Row) { this.operation = "insert"; this.patch = row; return this; }
  delete() { this.operation = "delete"; return this; }

  private matchingRows() {
    return (this.tables[this.table] ?? []).filter((row) => this.filters.every(([key, value]) => row[key] === value));
  }

  private execute() {
    if (this.operation === "insert") {
      const row = { id: `${this.table}-${(this.tables[this.table] ?? []).length + 1}`, ...this.patch };
      (this.tables[this.table] ??= []).push(row);
      return row;
    }
    const row = this.matchingRows()[0] ?? null;
    if (row && this.operation === "delete") {
      this.tables[this.table] = this.tables[this.table].filter((candidate) => candidate !== row);
      return { ...row };
    }
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

beforeEach(() => {
  vi.clearAllMocks();
  dependencies.link.mockResolvedValue({ status: "linked", clientId: "client-1", workflowRunId: "run-1" });
  dependencies.completeTasks.mockResolvedValue(undefined);
  dependencies.advance.mockResolvedValue({ advanced: true });
  dependencies.recordActivity.mockResolvedValue(undefined);
  dependencies.logPortalEvent.mockResolvedValue({ id: "event-1" });
  dependencies.normalize.mockReturnValue({
    hospitalName: "여의도기통찬의원",
    totalAmount: 2_200_000,
    depositRate: 50,
    paymentTerms: "계약금 50%",
    deliveryTerms: "촬영 후 납품",
    specialTerms: "",
  });
});

describe("document Core commands", () => {
  it("finalizes a draft quote only after the workflow advances", async () => {
    const db = memoryDb({
      quotes: [{ id: "quote-1", status: "draft", client_id: "client-1", workflow_run_id: "run-1" }],
    });
    const { completeQuote } = await import("@/lib/core/commands/document");

    const result = await completeQuote("quote-1", {}, db as never);

    expect(result).toMatchObject({ ok: true, value: { advanced: true, status: "final" } });
    expect(db.tables.quotes[0].status).toBe("final");
    expect(dependencies.completeTasks).toHaveBeenCalledWith(db, "run-1", "quote");
  });

  it("does not claim or persist final status while approvals remain open", async () => {
    dependencies.advance.mockResolvedValueOnce({ advanced: false, reason: "open_items" });
    const db = memoryDb({
      quotes: [{ id: "quote-1", status: "draft", client_id: "client-1", workflow_run_id: "run-1" }],
    });
    const { completeQuote } = await import("@/lib/core/commands/document");

    const result = await completeQuote("quote-1", {}, db as never);

    expect(result).toMatchObject({ ok: true, value: { advanced: false, advanceReason: "open_items", status: "draft" } });
    expect(db.tables.quotes[0].status).toBe("draft");
  });

  it("rejects an unapproved source quote before inserting a contract", async () => {
    const db = memoryDb({
      quotes: [{ id: "quote-1", status: "draft", client_id: "client-1", workflow_run_id: "run-1" }],
      contracts: [],
    });
    const { createContractFromQuote } = await import("@/lib/core/commands/document");

    const result = await createContractFromQuote("quote-1", db as never);

    expect(result).toMatchObject({ ok: false, code: "UNAPPROVED_QUOTE" });
    expect(db.tables.contracts).toHaveLength(0);
  });

  it("creates one contract from an approved quote and records its source", async () => {
    const db = memoryDb({
      quotes: [{
        id: "quote-1", status: "published", client_id: "client-1", workflow_run_id: "run-1",
        hospital_name: "여의도기통찬의원", quote_number: "Q-1",
      }],
      contracts: [],
    });
    const { createContractFromQuote } = await import("@/lib/core/commands/document");

    const result = await createContractFromQuote("quote-1", db as never);

    expect(result).toMatchObject({ ok: true, value: { clientId: "client-1", workflowRunId: "run-1" } });
    expect(db.tables.contracts[0]).toMatchObject({
      client_id: "client-1",
      workflow_run_id: "run-1",
      source_quote_id: "quote-1",
      status: "draft",
    });
    expect(dependencies.logPortalEvent).toHaveBeenCalledWith(expect.objectContaining({
      eventType: "contract_ready",
      targetId: db.tables.contracts[0].id,
    }));
  });

  it("returns the same contract idempotently for the same source quote", async () => {
    const db = memoryDb({
      quotes: [{ id: "quote-1", status: "final", client_id: "client-1", workflow_run_id: "run-1" }],
      contracts: [{ id: "contract-existing", workflow_run_id: "run-1", source_quote_id: "quote-1" }],
    });
    const { createContractFromQuote } = await import("@/lib/core/commands/document");

    const result = await createContractFromQuote("quote-1", db as never);

    expect(result).toMatchObject({
      ok: true,
      idempotent: true,
      value: { contractId: "contract-existing", clientId: "client-1", workflowRunId: "run-1" },
    });
    expect(db.tables.contracts).toHaveLength(1);
  });

  it("rejects a different source quote when the workflow already has a contract", async () => {
    const db = memoryDb({
      quotes: [{ id: "quote-2", status: "final", client_id: "client-1", workflow_run_id: "run-1" }],
      contracts: [{ id: "contract-existing", workflow_run_id: "run-1", source_quote_id: "quote-1" }],
    });
    const { createContractFromQuote } = await import("@/lib/core/commands/document");

    const result = await createContractFromQuote("quote-2", db as never);

    expect(result).toMatchObject({
      ok: false,
      code: "CONTRACT_SOURCE_CONFLICT",
      details: { contractId: "contract-existing", sourceQuoteId: "quote-1" },
    });
    expect(db.tables.contracts).toHaveLength(1);
  });

  it("rolls back the new contract when contract_ready cannot be recorded", async () => {
    dependencies.logPortalEvent.mockRejectedValueOnce(new Error("event unavailable"));
    const db = memoryDb({
      quotes: [{ id: "quote-1", status: "published", client_id: "client-1", workflow_run_id: "run-1" }],
      contracts: [],
    });
    const { createContractFromQuote } = await import("@/lib/core/commands/document");

    const result = await createContractFromQuote("quote-1", db as never);

    expect(result).toMatchObject({ ok: false, code: "EVENT_FAILED" });
    expect(db.tables.contracts).toHaveLength(0);
  });
});
