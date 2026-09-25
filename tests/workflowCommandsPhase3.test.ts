import { beforeEach, describe, expect, it, vi } from "vitest";

const dependencies = vi.hoisted(() => ({
  completeTasks: vi.fn(),
  advance: vi.fn(),
  getWorkflowRun: vi.fn(),
}));

vi.mock("@/lib/workflowAutomation", () => ({
  completeOpenStepTasksForManualSave: dependencies.completeTasks,
  maybeAdvanceWorkflow: dependencies.advance,
  getWorkflowRun: dependencies.getWorkflowRun,
}));

type Row = Record<string, unknown>;
type Tables = Record<string, Row[]>;

// documentCoreCommands.test.ts와 동일한 인메모리 쿼리 빌더.
class MemoryQuery {
  private filters: Array<[string, unknown]> = [];
  private operation: "select" | "update" | "insert" = "select";
  private patch: Row = {};

  constructor(private readonly tables: Tables, private readonly table: string) {}

  select() { return this; }
  eq(column: string, value: unknown) { this.filters.push([column, value]); return this; }
  update(patch: Row) { this.operation = "update"; this.patch = patch; return this; }
  insert(row: Row) { this.operation = "insert"; this.patch = row; return this; }

  private execute() {
    if (this.operation === "insert") {
      const row = { id: `${this.table}-${(this.tables[this.table] ?? []).length + 1}`, ...this.patch };
      (this.tables[this.table] ??= []).push(row);
      return row;
    }
    const rows = (this.tables[this.table] ?? []).filter((row) => this.filters.every(([key, value]) => row[key] === value));
    const row = rows[0] ?? null;
    if (row && this.operation === "update") Object.assign(row, this.patch);
    return row ? { ...row } : null;
  }

  async single() { return { data: this.execute(), error: null }; }
}

function memoryDb(tables: Tables) {
  return { tables, from(table: string) { return new MemoryQuery(tables, table); } };
}

beforeEach(() => {
  vi.clearAllMocks();
  dependencies.completeTasks.mockResolvedValue(undefined);
});

describe("workflow.ts Core commands — completeStep/completeShoot/confirmPayment", () => {
  it("completeShoot advances shooting to payment_confirm via the shared wrapper", async () => {
    dependencies.advance.mockResolvedValue({ advanced: true, result: { completed: false, to_step_key: "payment_confirm" } });
    const { completeShoot } = await import("@/lib/core/commands/workflow");

    const result = await completeShoot("run-1", {} as never);

    expect(dependencies.completeTasks).toHaveBeenCalledWith({}, "run-1", "shooting");
    expect(dependencies.advance).toHaveBeenCalledWith({}, "run-1", "shooting");
    expect(result).toMatchObject({ ok: true, value: { advanced: true, fromStep: "shooting", toStep: "payment_confirm" } });
  });

  it("confirmPayment advances payment_confirm to backup_sorting", async () => {
    dependencies.advance.mockResolvedValue({ advanced: true, result: { completed: false, to_step_key: "backup_sorting" } });
    const { confirmPayment } = await import("@/lib/core/commands/workflow");

    const result = await confirmPayment("run-1", {} as never);

    expect(dependencies.advance).toHaveBeenCalledWith({}, "run-1", "payment_confirm");
    expect(result).toMatchObject({ ok: true, value: { advanced: true, fromStep: "payment_confirm", toStep: "backup_sorting" } });
  });

  it("reports a blocked reason instead of throwing when open tasks remain", async () => {
    dependencies.advance.mockResolvedValue({ advanced: false, reason: "open_items" });
    const { completeStep } = await import("@/lib/core/commands/workflow");

    const result = await completeStep("run-1", "contract", {} as never);

    expect(result).toMatchObject({ ok: true, value: { advanced: false, fromStep: "contract", reason: "open_items" } });
  });

  it("surfaces a thrown error as a failed CoreCommandResult", async () => {
    dependencies.advance.mockRejectedValue(new Error("db down"));
    const { completeStep } = await import("@/lib/core/commands/workflow");

    const result = await completeStep("run-1", "contract", {} as never);

    expect(result).toMatchObject({ ok: false, reason: "db down" });
  });
});

describe("registerGallery Command", () => {
  it("registers an original gallery and advances client_selection", async () => {
    dependencies.getWorkflowRun.mockResolvedValue({ id: "run-1", current_step_key: "client_selection" });
    dependencies.advance.mockResolvedValue({ advanced: true, result: { completed: false, to_step_key: "retouching" } });
    const db = memoryDb({ photo_galleries: [] });
    const { registerGallery } = await import("@/lib/core/commands/workflow");

    const result = await registerGallery({
      hospitalName: "포토클리닉",
      nasLink: "https://nas.example.com/share/x",
      galleryType: "original_photo",
      clientId: "client-1",
      workflowRunId: "run-1",
    }, db as never);

    expect(result).toMatchObject({
      ok: true,
      value: { advance: { advanced: true, targetStep: "client_selection" } },
    });
    expect(db.tables.photo_galleries[0]).toMatchObject({ hospital_name: "포토클리닉", gallery_type: "original_photo" });
  });

  it("keeps the gallery registration a success even when the step advance is blocked", async () => {
    dependencies.getWorkflowRun.mockResolvedValue({ id: "run-1", current_step_key: "retouching" });
    dependencies.advance.mockResolvedValue({ advanced: false, reason: "open_items" });
    const db = memoryDb({ photo_galleries: [] });
    const { registerGallery } = await import("@/lib/core/commands/workflow");

    const result = await registerGallery({
      hospitalName: "포토클리닉",
      nasLink: "https://nas.example.com/share/y",
      galleryType: "final_photo",
      clientId: "client-1",
      workflowRunId: "run-1",
    }, db as never);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok result");
    expect(result.value.gallery).toMatchObject({ hospital_name: "포토클리닉" });
    expect(result.value.advance).toMatchObject({ advanced: false, targetStep: "retouching", reason: "open_items" });
  });

  it("does not attempt an advance when no client/workflow is linked", async () => {
    const db = memoryDb({ photo_galleries: [] });
    const { registerGallery } = await import("@/lib/core/commands/workflow");

    const result = await registerGallery({
      hospitalName: "포토클리닉",
      nasLink: "https://nas.example.com/share/z",
      galleryType: "final_photo",
    }, db as never);

    expect(result).toMatchObject({ ok: true, value: { advance: { advanced: false } } });
    expect(dependencies.getWorkflowRun).not.toHaveBeenCalled();
  });
});
