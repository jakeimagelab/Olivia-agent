import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  db: {},
  getWorkflowRun: vi.fn(),
  completeStep: vi.fn(),
  recordPcrmActivitySafely: vi.fn(),
}));

vi.mock("@/lib/supabase", () => ({ getSupabaseAdmin: () => mocks.db }));
vi.mock("@/lib/workflowAutomation", () => ({ getWorkflowRun: mocks.getWorkflowRun }));
vi.mock("@/lib/core/commands/workflow", () => ({ completeStep: mocks.completeStep }));
vi.mock("@/lib/pcrm/activity", () => ({ recordPcrmActivitySafely: mocks.recordPcrmActivitySafely }));

describe("workflow complete-step write failure", () => {
  it("returns ok:false when the workflow update fails", async () => {
    mocks.getWorkflowRun.mockResolvedValue({ client_id: "client-1" });
    mocks.completeStep.mockResolvedValue({ ok: false, reason: "워크플로 단계 변경에 실패했습니다: permission denied" });
    const { POST } = await import("@/app/api/workflow-runs/[id]/complete-step/route");

    const response = await POST(
      new NextRequest("http://localhost/api/workflow-runs/run-1/complete-step", {
        method: "POST",
        body: JSON.stringify({ stepKey: "quote" }),
      }),
      { params: Promise.resolve({ id: "run-1" }) },
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error: "워크플로 단계 변경에 실패했습니다: permission denied",
    });
    expect(mocks.recordPcrmActivitySafely).not.toHaveBeenCalled();
  });
});
