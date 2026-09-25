import { beforeEach, describe, expect, it, vi } from "vitest";

const sideEffects = vi.hoisted(() => ({
  acknowledged: 0,
  cleared: 0,
  events: 0,
  workflowError: null as Error | null,
}));

vi.mock("@/lib/photo-storage/server", () => ({
  acknowledgePhotoStorageEvents: async () => { sideEffects.acknowledged += 1; },
  clearPhotoProjectNotificationState: async () => { sideEffects.cleared += 1; },
  ensurePhotoStorageEvent: async () => { sideEffects.events += 1; },
}));
vi.mock("@/lib/olivia/events", () => ({
  createEventDeduplicationKey: (...parts: string[]) => parts.join(":"),
  emitOliviaEvent: async () => ({}),
}));
vi.mock("@/lib/photo-storage/shootingProgress", () => ({
  syncClassificationCompletedWorkflow: async () => {
    if (sideEffects.workflowError) throw sideEffects.workflowError;
  },
}));
vi.mock("@/lib/photo-storage/shootingProgressActions", () => ({
  registerOriginalDeliveryLink: async () => ({ galleryId: "gallery-1", selectionUrl: "https://example.com/select/1", portalUrl: null, clientId: null }),
}));

function dbFor(project: Record<string, unknown>) {
  const row = { ...project };
  const db = {
    row,
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: { ...row }, error: null }) }),
      }),
      update: (patch: Record<string, unknown>) => ({
        eq: () => ({
          eq: () => ({
            select: () => ({
              maybeSingle: async () => {
                Object.assign(row, patch);
                return { data: { ...row }, error: null };
              },
            }),
          }),
        }),
      }),
    }),
  };
  return db;
}

beforeEach(() => {
  sideEffects.acknowledged = 0;
  sideEffects.cleared = 0;
  sideEffects.events = 0;
  sideEffects.workflowError = null;
});

describe("photo Core commands", () => {
  it("reuses the classification prerequisites before writing", async () => {
    const db = dbFor({ id: "project-1", project_name: "0911_WINF", status: "MERGE_COMPLETED", nas_department: null, nas_shooting_mode: null });
    const { approveClassification } = await import("@/lib/core/commands/photo");
    const result = await approveClassification(db as never, "project-1");
    expect(result).toMatchObject({ ok: false, code: "CLASSIFICATION_CONTEXT_REQUIRED" });
    expect(db.row.status).toBe("MERGE_COMPLETED");
  });

  it("approves source separation and runs the existing side effects", async () => {
    const db = dbFor({ id: "project-1", project_name: "0911_WINF", status: "READY" });
    const { approveSourceSeparation } = await import("@/lib/core/commands/photo");
    const result = await approveSourceSeparation(db as never, "project-1");
    expect(result).toMatchObject({ ok: true, idempotent: false, value: { project: { status: "MERGE_APPROVED" } } });
    expect(sideEffects).toMatchObject({ acknowledged: 1, cleared: 1, events: 1 });
  });

  it("returns an explicit failure when workflow sync fails", async () => {
    sideEffects.workflowError = new Error("workflow unavailable");
    const db = dbFor({ id: "project-1", project_name: "0911_WINF", status: "CLASSIFY_COMPLETED", workflow_run_id: "run-1" });
    const { completeSceneSort } = await import("@/lib/core/commands/photo");
    const result = await completeSceneSort(db as never, "project-1");
    expect(result).toMatchObject({ ok: false, reason: "workflow unavailable" });
  });
});
