import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const commands = vi.hoisted(() => ({
  completeContract: vi.fn(),
  completeConti: vi.fn(),
}));

vi.mock("@/lib/core/commands/document", () => commands);

beforeEach(() => vi.clearAllMocks());

describe("document completion API routes", () => {
  it("maps a successful contract completion and preserves idempotency", async () => {
    commands.completeContract.mockResolvedValueOnce({
      ok: true,
      idempotent: true,
      value: {
        contractId: "contract-1",
        clientId: "client-1",
        workflowRunId: "run-1",
        status: "final",
        advanced: false,
      },
    });
    const { POST } = await import("@/app/api/contracts/[id]/complete/route");
    const request = new NextRequest("http://localhost/api/contracts/contract-1/complete", {
      method: "POST",
      body: JSON.stringify({ workflowRunId: "run-1" }),
    });

    const response = await POST(request, { params: Promise.resolve({ id: "contract-1" }) });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ ok: true, contractId: "contract-1", idempotent: true });
    expect(commands.completeContract).toHaveBeenCalledWith("contract-1", { workflowRunId: "run-1" });
  });

  it("maps a blocked contract completion to HTTP 409 with the Core reason", async () => {
    commands.completeContract.mockResolvedValueOnce({
      ok: false,
      code: "WORKFLOW_BLOCKED",
      reason: "아직 완료되지 않은 계약 단계 업무 또는 승인이 있습니다.",
    });
    const { POST } = await import("@/app/api/contracts/[id]/complete/route");
    const request = new NextRequest("http://localhost/api/contracts/contract-1/complete", { method: "POST" });

    const response = await POST(request, { params: Promise.resolve({ id: "contract-1" }) });
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body).toMatchObject({ ok: false, code: "WORKFLOW_BLOCKED" });
  });

  it("delegates conti completion to the document-aware Core command", async () => {
    commands.completeConti.mockResolvedValueOnce({
      ok: true,
      value: {
        contiId: "conti-1",
        clientId: "client-1",
        workflowRunId: "run-1",
        advanced: true,
      },
    });
    const { POST } = await import("@/app/api/conti/runs/[id]/complete/route");
    const request = new NextRequest("http://localhost/api/conti/runs/conti-1/complete", {
      method: "POST",
      body: JSON.stringify({ workflowRunId: "run-1" }),
    });

    const response = await POST(request, { params: Promise.resolve({ id: "conti-1" }) });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ ok: true, contiId: "conti-1", advanced: true, idempotent: false });
    expect(commands.completeConti).toHaveBeenCalledWith("conti-1", { workflowRunId: "run-1" });
  });
});
