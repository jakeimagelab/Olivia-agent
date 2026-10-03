import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const state = vi.hoisted(() => ({
  rows: [] as Array<Record<string, unknown>>,
  requestedIds: [] as string[],
}));

vi.mock("@/lib/passkey", () => ({ isAdminSession: () => true }));
vi.mock("@/lib/supabase", () => ({
  getSupabaseAdmin: () => ({
    from: () => ({
      select: () => ({
        in: async (_column: string, ids: string[]) => {
          state.requestedIds = ids;
          return { data: state.rows, error: null };
        },
      }),
    }),
  }),
}));

beforeEach(() => {
  vi.stubEnv("OLIVIA_WORKER_ID", "jake-macstudio-01");
  vi.stubEnv("OLIVIA_WORKER_IDS", "jake-macstudio-01,jake-macbookpro-01");
  state.rows = [
    { worker_id: "jake-macstudio-01", last_seen_at: new Date().toISOString(), worker_status: "idle", nas_connected: true, updated_at: new Date().toISOString() },
    { worker_id: "jake-macbookpro-01", last_seen_at: null, worker_status: null, nas_connected: null, updated_at: null },
  ];
  state.requestedIds = [];
});

afterEach(() => vi.unstubAllEnvs());

describe("GET /api/remote-workers/status", () => {
  it("keeps the default single-worker response contract", async () => {
    const { GET } = await import("@/app/api/remote-workers/status/route");
    const response = await GET(new NextRequest("http://localhost/api/remote-workers/status"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(state.requestedIds).toEqual(["jake-macstudio-01"]);
    expect(body.worker).toMatchObject({ id: "jake-macstudio-01", online: true });
    expect(body.workers).toBeUndefined();
  });

  it("returns all configured workers", async () => {
    const { GET } = await import("@/app/api/remote-workers/status/route");
    const response = await GET(new NextRequest("http://localhost/api/remote-workers/status?all=1"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(state.requestedIds).toEqual(["jake-macstudio-01", "jake-macbookpro-01"]);
    expect(body.workers).toHaveLength(2);
    expect(body.workers[0]).toMatchObject({ id: "jake-macstudio-01", online: true });
  });

  it("returns the requested known worker", async () => {
    const { GET } = await import("@/app/api/remote-workers/status/route");
    const response = await GET(new NextRequest("http://localhost/api/remote-workers/status?worker=jake-macbookpro-01"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(state.requestedIds).toEqual(["jake-macbookpro-01"]);
    expect(body.worker.id).toBe("jake-macbookpro-01");
  });

  it("rejects an unknown worker", async () => {
    const { GET } = await import("@/app/api/remote-workers/status/route");
    const response = await GET(new NextRequest("http://localhost/api/remote-workers/status?worker=unknown"));

    expect(response.status).toBe(400);
    expect(state.requestedIds).toEqual([]);
  });
});
