import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const state = vi.hoisted(() => ({
  inserted: [] as Array<Record<string, unknown>>,
}));

vi.mock("@/lib/passkey", () => ({ isAdminSession: () => true }));
vi.mock("@/lib/supabase", () => ({
  getSupabaseAdmin: () => ({
    from: () => ({
      insert: (row: Record<string, unknown>) => {
        state.inserted.push(row);
        return {
          select: () => ({
            single: async () => ({
              data: {
                id: "018e2f30-92af-78b1-8f21-67f4404f5027",
                created_at: "2026-09-22T22:08:00.000Z",
                ...row,
              },
              error: null,
            }),
          }),
        };
      },
    }),
  }),
}));

async function postListFolder(payload: Record<string, unknown>) {
  const { POST } = await import("@/app/api/remote-jobs/route");
  return POST(new NextRequest("http://localhost/api/remote-jobs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "LIST_FOLDER", payload }),
  }));
}

beforeEach(() => {
  state.inserted.length = 0;
});

describe("POST /api/remote-jobs LIST_FOLDER root contract", () => {
  it.each([
    ["omitted", {}],
    ["null", { remote_path: null }],
    ["empty", { remote_path: "" }],
    ["explicit", { root: true }],
  ])("queues %s remote_path as the Workstation root", async (_label, payload) => {
    const response = await postListFolder(payload);

    expect(response.status).toBe(200);
    expect(state.inserted).toHaveLength(1);
    expect(state.inserted[0]).toMatchObject({
      action: "LIST_FOLDER",
      payload: { root: true },
      status: "QUEUED",
    });
  });

  it("rejects an explicit root combined with a child path", async () => {
    const response = await postListFolder({ root: true, remote_path: "0911_WINF" });

    expect(response.status).toBe(400);
    expect(state.inserted).toHaveLength(0);
  });

  it.each([
    ["non-string", { remote_path: 42 }],
    ["absolute", { remote_path: "/Volumes/Workstation" }],
    ["traversal", { remote_path: "../outside" }],
  ])("rejects a %s remote_path before a job is queued", async (_label, payload) => {
    const response = await postListFolder(payload);

    expect(response.status).toBe(400);
    expect(state.inserted).toHaveLength(0);
  });
});
