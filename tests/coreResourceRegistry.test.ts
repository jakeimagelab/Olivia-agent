import { describe, expect, it } from "vitest";
import { loadCoreResourceRegistry } from "@/lib/core/readModels/resourceRegistry";
import { memorySupabase, type MemoryTables } from "./helpers/memorySupabase";

function baseTables(overrides: Partial<MemoryTables> = {}): MemoryTables {
  return {
    quotes: [], contracts: [], conti_runs: [], conti_saves: [], photo_storage_projects: [],
    select_galleries: [], photo_galleries: [], ...overrides,
  };
}

describe("Core Resource Registry", () => {
  it("isolates resources by exact workflow run for the same client", async () => {
    const db = memorySupabase(baseTables({
      quotes: [
        { id: "quote-2025", client_id: "client-1", workflow_run_id: "run-2025", status: "final", created_at: "2025-01-01" },
        { id: "quote-2026", client_id: "client-1", workflow_run_id: "run-2026", status: "final", created_at: "2026-01-01" },
      ],
      contracts: [
        { id: "contract-2025", client_id: "client-1", workflow_run_id: "run-2025", created_at: "2025-01-01" },
        { id: "contract-2026", client_id: "client-1", workflow_run_id: "run-2026", created_at: "2026-01-01" },
      ],
      conti_runs: [
        { id: "conti-2025", hospital_id: "client-1", workflow_run_id: "run-2025", updated_at: "2025-01-01" },
        { id: "conti-2026", hospital_id: "client-1", workflow_run_id: "run-2026", updated_at: "2026-01-01" },
      ],
    }));
    const result = await loadCoreResourceRegistry(db as never, "run-2026");
    expect(result.quote?.id).toBe("quote-2026");
    expect(result.contract?.id).toBe("contract-2026");
    expect(result.conti?.id).toBe("conti-2026");
  });

  it("reuses approved quote selection when a newer draft exists", async () => {
    const db = memorySupabase(baseTables({
      quotes: [
        { id: "approved", workflow_run_id: "run-1", status: "final", created_at: "2026-01-01" },
        { id: "new-draft", workflow_run_id: "run-1", status: "draft", created_at: "2026-02-01" },
      ],
    }));
    const result = await loadCoreResourceRegistry(db as never, "run-1");
    expect(result.quote).toMatchObject({ id: "approved", approved: true });
  });

  it("preserves the contract source quote id", async () => {
    const db = memorySupabase(baseTables({
      contracts: [{ id: "contract-1", workflow_run_id: "run-1", source_quote_id: "quote-1", created_at: "2026-01-01" }],
    }));
    const result = await loadCoreResourceRegistry(db as never, "run-1");
    expect(result.contract?.sourceQuoteId).toBe("quote-1");
  });

  it("does not adopt an unlinked legacy contract by hospital name", async () => {
    const db = memorySupabase(baseTables({
      contracts: [{ id: "legacy", workflow_run_id: null, hospital_name: "기통찬의원", created_at: "2026-01-01" }],
    }));
    const result = await loadCoreResourceRegistry(db as never, "run-2026");
    expect(result.contract).toBeNull();
  });

  it("uses canonical conti_runs first and exact-run legacy conti as fallback", async () => {
    const db = memorySupabase(baseTables({
      conti_runs: [{ id: "conti-v2", workflow_run_id: "run-1", updated_at: "2026-01-01" }],
      conti_saves: [{ id: "conti-legacy", workflow_run_id: "run-1", saved_at: "2026-02-01" }],
    }));
    const canonical = await loadCoreResourceRegistry(db as never, "run-1");
    expect(canonical.conti).toMatchObject({ id: "conti-v2", sourceTable: "conti_runs" });

    db.tables.conti_runs = [];
    const fallback = await loadCoreResourceRegistry(db as never, "run-1");
    expect(fallback.conti).toMatchObject({ id: "conti-legacy", sourceTable: "conti_saves" });
  });

  it("keeps select and photo galleries inside the exact workflow run", async () => {
    const db = memorySupabase(baseTables({
      select_galleries: [
        { id: "select-a", workflow_run_id: "run-a", created_at: "2026-02-01" },
        { id: "select-b", workflow_run_id: "run-b", created_at: "2026-03-01" },
      ],
      photo_galleries: [
        { id: "photo-a", workflow_run_id: "run-a", created_at: "2026-02-01" },
        { id: "photo-b", workflow_run_id: "run-b", created_at: "2026-03-01" },
      ],
    }));
    const result = await loadCoreResourceRegistry(db as never, "run-b");
    expect(result.selectGallery?.id).toBe("select-b");
    expect(result.photoGallery?.id).toBe("photo-b");
  });
});
