import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const state = vi.hoisted(() => ({
  operations: [] as string[],
  action: "PHOTO_CLASSIFY_WORK",
  syncError: false,
}));

async function recordProjectSync() {
  state.operations.push("photo-project-sync");
  if (state.syncError) throw new Error("project sync failed");
}

function filterResult(row: Record<string, unknown>) {
  const filter = {
    eq: () => filter,
    select: () => filter,
    maybeSingle: async () => ({ data: row, error: null }),
  };
  return filter;
}

vi.mock("@/lib/remoteWorkerAuth", () => ({
  isAuthorizedWorker: () => true,
  getConfiguredWorkerId: () => "test-worker",
}));

vi.mock("@/lib/supabase", () => ({
  getSupabaseAdmin: () => ({
    from: (table: string) => {
      if (table === "remote_workers") {
        return { upsert: async () => ({ error: null }) };
      }
      if (table !== "remote_jobs") throw new Error(`Unexpected table: ${table}`);
      return {
        select: () => filterResult({
          id: "job-1",
          status: "RUNNING",
          action: state.action,
          payload: { project_id: "project-1", work_relative_path: "0922_test_os" },
        }),
        update: (patch: Record<string, unknown>) => {
          if (patch.status === "COMPLETED" || patch.status === "FAILED") {
            state.operations.push("remote-job-terminal-update");
          } else {
            state.operations.push("remote-job-running-update");
          }
          return filterResult({
            id: "job-1",
            status: patch.status,
            action: state.action,
            payload: { project_id: "project-1", work_relative_path: "0922_test_os" },
          });
        },
      };
    },
  }),
}));

vi.mock("@/lib/photo-storage/mergeSync", () => ({
  syncPhotoMergeProject: recordProjectSync,
}));
vi.mock("@/lib/photo-storage/copySync", () => ({
  syncPhotoStageProject: recordProjectSync,
}));
vi.mock("@/lib/photo-storage/classificationSync", () => ({
  syncPhotoClassificationProject: recordProjectSync,
}));

async function report(status: "RUNNING" | "COMPLETED") {
  const { POST } = await import("@/app/api/worker/report/route");
  return POST(new NextRequest("http://localhost/api/worker/report", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      job_id: "job-1",
      status,
      ...(status === "RUNNING"
        ? { progress: { stage: "ORGANIZING", current: 1, total: 2, message: "분류 중" } }
        : { result: { ok: true, status: "CLASSIFY_COMPLETED", jpgCount: 2, sceneCount: 1 } }),
    }),
  }));
}

beforeEach(() => {
  state.operations.length = 0;
  state.action = "PHOTO_CLASSIFY_WORK";
  state.syncError = false;
});

describe("POST /api/worker/report photo lifecycle ordering", () => {
  it.each(["PHOTO_PREPARE_SOURCE", "PHOTO_STAGE_JPG", "PHOTO_CLASSIFY_WORK"])(
    "synchronizes %s project state before making the remote job terminal",
    async (action) => {
      state.action = action;

      const response = await report("COMPLETED");

      expect(response.status).toBe(200);
      expect(state.operations).toEqual([
        "photo-project-sync",
        "remote-job-terminal-update",
      ]);
    },
  );

  it("keeps RUNNING progress observational after the active-job fence exists", async () => {
    const response = await report("RUNNING");

    expect(response.status).toBe(200);
    expect(state.operations).toEqual([
      "remote-job-running-update",
      "photo-project-sync",
    ]);
  });

  it("keeps the remote job active when terminal project synchronization fails", async () => {
    state.syncError = true;

    const response = await report("COMPLETED");

    expect(response.status).toBe(500);
    expect(state.operations).toEqual(["photo-project-sync"]);
  });
});
