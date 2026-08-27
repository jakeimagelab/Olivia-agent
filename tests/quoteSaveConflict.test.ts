import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/clientLookup", () => ({ resolveClientId: vi.fn(async () => "client-1") }));
vi.mock("@/lib/workflowRunLookup", () => ({ resolveWorkflowRunId: vi.fn(async () => null) }));
vi.mock("@/lib/clientPortal", () => ({ logPortalEvent: vi.fn(async () => {}) }));
vi.mock("@/lib/olivia/clientCandidate", () => ({ registerClientCandidate: vi.fn(async () => {}) }));

let existingRow: { id: string; updated_at: string } | null = null;

function queryFor() {
  const query: any = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    order: vi.fn(() => query),
    limit: vi.fn(() => query),
    maybeSingle: vi.fn(async () => ({ data: existingRow, error: null })),
    update: vi.fn(() => query),
    insert: vi.fn(() => query),
    single: vi.fn(async () => ({
      data: { id: existingRow?.id ?? "quote-new-1", created_at: "2026-08-27T00:00:00.000Z", updated_at: "2026-08-27T00:10:00.000Z" },
      error: null,
    })),
  };
  return query;
}

vi.mock("@/lib/supabase", () => ({ getSupabaseAdmin: () => ({ from: () => queryFor() }) }));

const { POST } = await import("@/app/api/quotes/route");

function request(body: Record<string, unknown>) {
  return new NextRequest("http://localhost/api/quotes", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

// POST /api/quotes는 사람의 저장(수동/자동)과 Agent tool의 직접 DB write가 같은 행을 다르게
// 건드릴 수 있다는 걸 감지만 하고 막지는 않는다(soft-warn, §45/46) — Phase 5.
describe("POST /api/quotes — 저장 충돌 감지(soft-warn)", () => {
  it("신규 견적(기존 row 없음)은 항상 conflictDetected가 없다", async () => {
    existingRow = null;
    const res = await POST(request({ quoteNumber: "PC-20260827-001", hospitalName: "히어산부인과" }));
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.conflictDetected).toBeFalsy();
  });

  it("lastKnownUpdatedAt이 실제 updated_at과 같으면 충돌이 아니다", async () => {
    existingRow = { id: "quote-1", updated_at: "2026-08-27T00:00:00.000Z" };
    const res = await POST(request({
      quoteNumber: "PC-20260827-001",
      hospitalName: "히어산부인과",
      lastKnownUpdatedAt: "2026-08-27T00:00:00.000Z",
    }));
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.conflictDetected).toBe(false);
  });

  it("lastKnownUpdatedAt이 실제 updated_at보다 오래됐으면 저장은 그대로 진행하되 conflictDetected를 true로 알려준다", async () => {
    existingRow = { id: "quote-1", updated_at: "2026-08-27T00:05:00.000Z" };
    const res = await POST(request({
      quoteNumber: "PC-20260827-001",
      hospitalName: "히어산부인과",
      // 사람이 마지막으로 알고 있던 시각 — 그 사이 Agent가 먼저 저장해서 실제 updated_at이 더 최신이다.
      lastKnownUpdatedAt: "2026-08-27T00:00:00.000Z",
    }));
    const json = await res.json();
    // 막지 않는다 — 여전히 200/ok, 실제로 저장은 진행된다.
    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.conflictDetected).toBe(true);
  });

  it("lastKnownUpdatedAt을 안 보내면(예: 예전 클라이언트) 충돌 판단 자체를 하지 않는다", async () => {
    existingRow = { id: "quote-1", updated_at: "2026-08-27T00:05:00.000Z" };
    const res = await POST(request({ quoteNumber: "PC-20260827-001", hospitalName: "히어산부인과" }));
    const json = await res.json();
    expect(json.conflictDetected).toBeFalsy();
  });
});
