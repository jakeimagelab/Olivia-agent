import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const state = vi.hoisted(() => ({
  authenticatedWorker: "jake-macbookpro-01" as string | null,
  rpcCalls: [] as Array<{ name: string; args: Record<string, unknown> }>,
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
        return { data: [{ job_id: "job-macbook", action: "VIDEO_AUDIO_EXTRACT", payload: { source_relative_path: "촬영" } }], error: null };
      }
      return { data: null, error: null };
    },
    from: () => ({
      upsert: async () => ({ error: null }),
      update: () => ({ eq: async () => ({ error: null }) }),
    }),
  }),
}));

beforeEach(() => {
  state.authenticatedWorker = "jake-macbookpro-01";
  state.rpcCalls.length = 0;
});

describe("GET /api/worker/next with multiple workers", () => {
  it("lets MacBook claim only its remote job and skips photo approval claims", async () => {
    const { GET } = await import("@/app/api/worker/next/route");
    const response = await GET(new NextRequest("http://localhost/api/worker/next"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ job_id: "job-macbook", action: "VIDEO_AUDIO_EXTRACT" });
    expect(state.rpcCalls).toEqual([{ name: "claim_remote_job", args: { p_worker_id: "jake-macbookpro-01" } }]);
  });

  it("rejects an unauthenticated worker", async () => {
    state.authenticatedWorker = null;
    const { GET } = await import("@/app/api/worker/next/route");
    const response = await GET(new NextRequest("http://localhost/api/worker/next"));

    expect(response.status).toBe(401);
    expect(state.rpcCalls).toHaveLength(0);
  });
});
