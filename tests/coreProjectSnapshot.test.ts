import { describe, expect, it } from "vitest";
import { getCoreProjectSnapshot, summarizeCoreProjectSnapshot } from "@/lib/core/readModels/projectSnapshot";
import { memorySupabase, type MemoryTables } from "./helpers/memorySupabase";

function tables(overrides: Partial<MemoryTables> = {}): MemoryTables {
  return {
    workflow_runs: [], clients: [], workflow_step_runs: [], agent_tasks: [], agent_approvals: [], mailing_queue: [],
    quotes: [], contracts: [], conti_runs: [], conti_saves: [], photo_storage_projects: [], select_galleries: [], photo_galleries: [],
    ...overrides,
  };
}

function run(overrides: Record<string, unknown> = {}) {
  return {
    id: "run-1", client_id: "client-1", project_id: null, client_name: "기통찬의원",
    project_name: "2026 촬영", current_step_key: "quote", status: "active",
    created_at: "2026-01-01", updated_at: "2026-01-02", ...overrides,
  };
}

describe("Core Project Snapshot", () => {
  it("returns PROJECT_NOT_FOUND for a missing workflow run", async () => {
    const result = await getCoreProjectSnapshot("missing", memorySupabase(tables()) as never);
    expect(result).toMatchObject({ ok: false, code: "PROJECT_NOT_FOUND" });
  });

  it("builds a snapshot when project_id is null", async () => {
    const db = memorySupabase(tables({ workflow_runs: [run()], clients: [{ id: "client-1", hospital_name: "기통찬의원" }] }));
    const result = await getCoreProjectSnapshot("run-1", db as never);
    expect(result).toMatchObject({ ok: true, value: { project: { workflowRunId: "run-1", projectId: null } } });
  });

  it("uses the persisted current step and actual completed step rows only", async () => {
    const db = memorySupabase(tables({
      workflow_runs: [run({ current_step_key: "quote" })],
      workflow_step_runs: [
        { workflow_run_id: "run-1", step_key: "consult_meeting", status: "completed", updated_at: "2026-01-01" },
        { workflow_run_id: "run-1", step_key: "quote", status: "in_progress", updated_at: "2026-01-02" },
        { workflow_run_id: "run-1", step_key: "contract", status: "skipped", updated_at: "2026-01-03" },
      ],
    }));
    const result = await getCoreProjectSnapshot("run-1", db as never);
    expect(result.ok && result.value.workflow.currentStep).toBe("quote");
    expect(result.ok && result.value.workflow.completedSteps).toEqual(["consult_meeting"]);
    expect(result.ok && result.value.workflow.stepStates.find((step) => step.key === "contract")?.status).toBe("skipped");
  });

  it("includes exact-run contract resources", async () => {
    const db = memorySupabase(tables({
      workflow_runs: [run({ current_step_key: "contract" })],
      contracts: [{ id: "contract-1", workflow_run_id: "run-1", source_quote_id: null, status: "draft", created_at: "2026-01-01" }],
    }));
    const result = await getCoreProjectSnapshot("run-1", db as never);
    expect(result.ok && result.value.resources.contract?.id).toBe("contract-1");
  });

  it("reports a contract source quote mismatch", async () => {
    const db = memorySupabase(tables({
      workflow_runs: [run({ current_step_key: "contract" })],
      quotes: [{ id: "quote-current", workflow_run_id: "run-1", status: "final", created_at: "2026-01-02" }],
      contracts: [{ id: "contract-1", workflow_run_id: "run-1", source_quote_id: "quote-other", created_at: "2026-01-03" }],
    }));
    const result = await getCoreProjectSnapshot("run-1", db as never);
    expect(result.ok && result.value.consistency).toEqual({ ok: false, issues: ["CONTRACT_SOURCE_QUOTE_MISMATCH"] });
  });

  it("surfaces query failures instead of returning an empty snapshot", async () => {
    const db = memorySupabase(tables({ workflow_runs: [run()] }), { contracts: { message: "contracts unavailable" } });
    const result = await getCoreProjectSnapshot("run-1", db as never);
    expect(result).toMatchObject({ ok: false, code: "SNAPSHOT_FAILED" });
    expect(!result.ok && result.reason).toContain("contracts unavailable");
  });

  it("produces a deterministic summary without inventing missing resources", async () => {
    const db = memorySupabase(tables({ workflow_runs: [run({ current_step_key: "contract" })] }));
    const result = await getCoreProjectSnapshot("run-1", db as never);
    expect(result.ok && summarizeCoreProjectSnapshot(result.value)).toContain("계약서 없음");
    expect(result.ok && summarizeCoreProjectSnapshot(result.value)).toContain("콘티 없음");
  });
});
