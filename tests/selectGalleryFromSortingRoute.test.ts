import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const state = vi.hoisted(() => ({
  workflowRun: { id: "run-1", current_step_key: "backup_sorting" } as Record<string, unknown> | null,
  gallery: null as Record<string, unknown> | null,
  advanceResult: { skipped: false } as Record<string, unknown>,
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

vi.mock("@/lib/workflowAutomation", () => ({
  advanceWorkflow: vi.fn(async () => state.advanceResult),
}));

import { POST } from "@/app/api/select-galleries/create-from-photo-sorting/route";

function req(body: Record<string, unknown>) {
  return new NextRequest("http://localhost/api/select-galleries/create-from-photo-sorting", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

// PHASE 3 작업 1-A(2026-09-25) — 갤러리·이미지는 이미 저장된 뒤에 단계 전진이 건너뛰어져도
// (from_step_key 불일치 등 레이스) throw해서 500을 내지 않는다. 갤러리 생성은 성공(ok:true)이고
// 단계 전진 결과만 advance 필드로 별도로 알린다.
describe("POST /api/select-galleries/create-from-photo-sorting — 부분 성공 처리", () => {
  it("returns ok:true with an advance failure reason instead of a 500 when the step already changed", async () => {
    state.workflowRun = { id: "run-1", current_step_key: "backup_sorting" };
    state.advanceResult = { skipped: true, reason: "current step is client_selection, expected backup_sorting" };

    const res = await POST(req({ title: "테스트 갤러리", workflowRunId: "run-1", scenes: [] }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toMatchObject({
      ok: true,
      gallery: { id: "gallery-1" },
      shareToken: "token-abc",
      advance: { advanced: false, reason: "current step is client_selection, expected backup_sorting" },
    });
  });

  it("reports advanced:true when the step transition succeeds", async () => {
    state.workflowRun = { id: "run-1", current_step_key: "backup_sorting" };
    state.advanceResult = { skipped: false, from_step_key: "backup_sorting", to_step_key: "client_selection", created: [] };

    const res = await POST(req({ title: "테스트 갤러리", workflowRunId: "run-1", scenes: [] }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toMatchObject({ ok: true, advance: { advanced: true } });
  });

  it("skips the advance entirely once already at client_selection (idempotent)", async () => {
    state.workflowRun = { id: "run-1", current_step_key: "client_selection" };

    const res = await POST(req({ title: "테스트 갤러리", workflowRunId: "run-1", scenes: [] }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toMatchObject({ ok: true, advance: { advanced: false } });
  });
});
