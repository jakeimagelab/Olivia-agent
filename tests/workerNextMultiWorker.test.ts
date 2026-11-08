import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const state = vi.hoisted(() => ({
  authenticatedWorker: "jake-macbookpro-01" as string | null,
  rpcCalls: [] as Array<{ name: string; args: Record<string, unknown> }>,
  remoteJob: { job_id: "job-macbook", action: "VIDEO_AUDIO_EXTRACT", payload: { source_relative_path: "촬영" } } as Record<string, unknown> | null,
  workerUpserts: [] as Array<Record<string, unknown>>,
  workerUpdates: 0,
}));

vi.mock("@/lib/remoteWorkerAuth", () => ({
  authorizeWorker: () => state.authenticatedWorker,
  getConfiguredWorkerId: () => "jake-macstudio-01",
}));

vi.mock("@/lib/supabase", () => ({
  getSupabaseAdmin: () => ({
    rpc: async (name: string, args: Record<string, unknown>) => {
      state.rpcCalls.push({ name, args });
      if (name === "claim_remote_job") {
        return { data: state.remoteJob ? [state.remoteJob] : [], error: null };
      }
      return { data: null, error: null };
    },
    from: () => ({
      upsert: async (row: Record<string, unknown>) => {
        state.workerUpserts.push(row);
        return { error: null };
      },
      update: () => {
        state.workerUpdates += 1;
        return { eq: async () => ({ error: null }) };
      },
    }),
  }),
}));

beforeEach(() => {
  state.authenticatedWorker = "jake-macbookpro-01";
  state.rpcCalls.length = 0;
  state.remoteJob = { job_id: "job-macbook", action: "VIDEO_AUDIO_EXTRACT", payload: { source_relative_path: "촬영" } };
  state.workerUpserts.length = 0;
  state.workerUpdates = 0;
});

describe("GET /api/worker/next with multiple workers", () => {
  it("lets MacBook claim only its remote job and skips photo approval claims", async () => {
    const { GET } = await import("@/app/api/worker/next/route");
    const response = await GET(new NextRequest("http://localhost/api/worker/next"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ job_id: "job-macbook", action: "VIDEO_AUDIO_EXTRACT" });
    expect(state.rpcCalls).toEqual([{ name: "claim_remote_job", args: { p_worker_id: "jake-macbookpro-01" } }]);
    expect(state.workerUpserts).toHaveLength(1);
    expect(state.workerUpserts[0]).toMatchObject({ worker_id: "jake-macbookpro-01", worker_status: "busy" });
    expect(state.workerUpdates).toBe(0);
  });

  it("writes one idle heartbeat for an empty poll instead of upsert plus update", async () => {
    state.remoteJob = null;
    const { GET } = await import("@/app/api/worker/next/route");
    const response = await GET(new NextRequest("http://localhost/api/worker/next"));

    expect(await response.json()).toEqual({});
    expect(state.workerUpserts).toHaveLength(1);
    expect(state.workerUpserts[0]).toMatchObject({ worker_id: "jake-macbookpro-01", worker_status: "idle" });
    expect(state.workerUpdates).toBe(0);
  });

  it("preserves primary photo claim order while recording one final heartbeat", async () => {
    state.authenticatedWorker = "jake-macstudio-01";
    const { GET } = await import("@/app/api/worker/next/route");
    const response = await GET(new NextRequest("http://localhost/api/worker/next"));

    expect(response.status).toBe(200);
    expect(state.rpcCalls.map((call) => call.name)).toEqual([
      "claim_merge_approved_photo_project",
      "claim_approved_photo_project",
      "claim_nas_classify_photo_project",
      "claim_remote_job",
    ]);
    expect(state.workerUpserts).toHaveLength(1);
    expect(state.workerUpdates).toBe(0);
  });

  it("rejects an unauthenticated worker", async () => {
    state.authenticatedWorker = null;
    const { GET } = await import("@/app/api/worker/next/route");
    const response = await GET(new NextRequest("http://localhost/api/worker/next"));

    expect(response.status).toBe(401);
    expect(state.rpcCalls).toHaveLength(0);
    expect(state.workerUpserts).toHaveLength(0);
  });
});
