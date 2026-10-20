import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const state = vi.hoisted(() => ({
  workflowRun: { id: "run-1", current_step_key: "backup_sorting" } as Record<string, unknown> | null,
  gallery: null as Record<string, unknown> | null,
  checkUpdates: [] as Array<Record<string, unknown>>,
}));

vi.mock("@/lib/supabase", () => ({
  getSupabaseAdmin: () => ({
    from: (table: string) => {
      if (table === "workflow_runs") {
        return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: state.workflowRun, error: null }) }) }) };
      }
      if (table === "select_galleries") {
        return {
          insert: (row: Record<string, unknown>) => ({
            select: () => ({
              single: async () => {
                state.gallery = { id: "gallery-1", ...row };
                return { data: state.gallery, error: null };
              },
            }),
          }),
        };
      }
      throw new Error(`unexpected table: ${table}`);
    },
  }),
}));

vi.mock("@/lib/selectGallery", () => ({
  generateShareToken: () => "token-abc",
  getFileExpiresAt: () => "2026-10-01T00:00:00.000Z",
}));

vi.mock("@/lib/workflowCheckPersistence", () => ({
  writeWorkflowChecks: vi.fn(async (_db: unknown, input: Record<string, unknown>) => {
    state.checkUpdates.push(input);
    return { id: "run-1" };
  }),
}));

import { POST } from "@/app/api/select-galleries/create-from-photo-sorting/route";

function req(body: Record<string, unknown>) {
  return new NextRequest("http://localhost/api/select-galleries/create-from-photo-sorting", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/select-galleries/create-from-photo-sorting — 체크 연결", () => {
  beforeEach(() => {
    state.checkUpdates.length = 0;
  });

  it("marks backup completion and direct classification approval after creating a gallery", async () => {
    state.workflowRun = { id: "run-1", current_step_key: "backup_sorting" };

    const res = await POST(req({ title: "테스트 갤러리", workflowRunId: "run-1", scenes: [] }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toMatchObject({
      ok: true,
      gallery: { id: "gallery-1" },
      shareToken: "token-abc",
      checksUpdated: true,
    });
    expect(state.checkUpdates[0]).toMatchObject({
      workflowRunId: "run-1",
      updates: [
        { key: "backup_sorted", done: true, by: "auto" },
        { key: "sort_approved", done: true, by: "user" },
      ],
    });
  });

  it("updates the same checks when an older run already displays client selection", async () => {
    state.workflowRun = { id: "run-1", current_step_key: "client_selection" };

    const res = await POST(req({ title: "테스트 갤러리", workflowRunId: "run-1", scenes: [] }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toMatchObject({ ok: true, checksUpdated: true });
    expect(state.checkUpdates).toHaveLength(1);
  });

  it("does not write workflow checks for an unlinked gallery", async () => {
    state.workflowRun = null;

    const res = await POST(req({ title: "테스트 갤러리", scenes: [] }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toMatchObject({ ok: true, checksUpdated: false });
    expect(state.checkUpdates).toHaveLength(0);
  });
});
