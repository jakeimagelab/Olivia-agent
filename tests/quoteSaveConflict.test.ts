import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/clientLookup", () => ({ resolveClientId: vi.fn(async () => "client-new") }));
vi.mock("@/lib/workflowRunLookup", () => ({ resolveWorkflowRunId: vi.fn(async () => "run-new") }));
vi.mock("@/lib/clientPortal", () => ({ logPortalEvent: vi.fn(async () => {}) }));
vi.mock("@/lib/olivia/clientCandidate", () => ({ registerClientCandidate: vi.fn(async () => {}) }));

type ExistingRow = {
  id: string;
  client_id: string | null;
  workflow_run_id: string | null;
  created_at: string;
  updated_at: string;
};

let existingRow: ExistingRow | null = null;
let updateResult: ExistingRow | null = null;
let insertedCount = 0;
let updatedIds: string[] = [];
let updatePayload: Record<string, unknown> | null = null;

function queryFor() {
  let operation: "read" | "insert" | "update" = "read";
  const filters: Record<string, unknown> = {};
  const query: any = {
    select: vi.fn(() => query),
    eq: vi.fn((key: string, value: unknown) => { filters[key] = value; return query; }),
    update: vi.fn((payload: Record<string, unknown>) => { operation = "update"; updatePayload = payload; return query; }),
    insert: vi.fn(() => { operation = "insert"; insertedCount += 1; return query; }),
    maybeSingle: vi.fn(async () => {
      if (operation === "update") {
        if (filters.id) updatedIds.push(String(filters.id));
        return { data: updateResult, error: null };
      }
      return { data: existingRow, error: null };
    }),
    single: vi.fn(async () => ({
      data: { id: "quote-new-1", created_at: "2026-11-03T00:00:00.000Z", updated_at: "2026-11-03T00:00:01.000Z" },
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

const existing = (patch: Partial<ExistingRow> = {}): ExistingRow => ({
  id: "quote-b",
  client_id: "client-b",
  workflow_run_id: "run-b",
  created_at: "2026-11-03T00:00:00.000Z",
  updated_at: "2026-11-03T00:05:00.000Z",
  ...patch,
});

describe("POST /api/quotes — UUID와 문서 소유 관계 보호", () => {
  beforeEach(() => {
    existingRow = null;
    updateResult = null;
    insertedCount = 0;
    updatedIds = [];
    updatePayload = null;
  });

  it("병원명·항목·금액이 모두 없는 초기 폼은 저장하지 않는다", async () => {
    const response = await POST(request({ quoteNumber: "PCQ-20261103-0002", hospitalName: "", items: [], totalAmount: 0 }));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ ok: false, skipped: true });
  });

  it("신규 견적은 UUID와 고객·촬영 건을 돌려준다", async () => {
    const response = await POST(request({ quoteNumber: "PCQ-20261103-0020", hospitalName: "신규의원" }));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true, id: "quote-new-1", clientId: "client-new", workflowRunId: "run-new", updated: false,
    });
    expect(insertedCount).toBe(1);
    expect(updatedIds).toEqual([]);
  });

  it("기존 견적은 견적번호가 아니라 요청한 UUID 한 건만 수정하고 소유 관계를 유지한다", async () => {
    existingRow = existing();
    updateResult = existing({ updated_at: "2026-11-03T00:06:00.000Z" });
    const response = await POST(request({
      quoteId: "quote-b",
      quoteNumber: "번호를-바꿔도-UUID가-기준",
      hospitalName: "표시용 병원명 수정",
      totalAmount: 1_500_000,
      clientId: "client-b",
      workflowRunId: "run-b",
      lastKnownUpdatedAt: "2026-11-03T00:05:00.000Z",
    }));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true, id: "quote-b", clientId: "client-b", workflowRunId: "run-b", updated: true,
    });
    expect(updatedIds).toEqual(["quote-b"]);
    expect(insertedCount).toBe(0);
    expect(updatePayload).toMatchObject({
      hospital_name: "표시용 병원명 수정", client_id: "client-b", workflow_run_id: "run-b",
    });
  });

  it("다른 고객 또는 촬영 건으로 기존 문서를 재연결하려는 저장을 거부한다", async () => {
    existingRow = existing();
    const response = await POST(request({
      quoteId: "quote-b", quoteNumber: "PCQ-B", hospitalName: "B병원",
      clientId: "client-a", workflowRunId: "run-a", lastKnownUpdatedAt: existingRow.updated_at,
    }));
    expect(response.status).toBe(409);
    expect(updatedIds).toEqual([]);
    expect(insertedCount).toBe(0);
  });

  it("다른 곳의 선행 저장을 감지하면 자동 덮어쓰지 않는다", async () => {
    existingRow = existing();
    const response = await POST(request({
      quoteId: "quote-b", quoteNumber: "PCQ-B", hospitalName: "B병원",
      clientId: "client-b", workflowRunId: "run-b", lastKnownUpdatedAt: "2026-11-03T00:00:00.000Z",
    }));
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({ ok: false, conflictDetected: true });
    expect(updatedIds).toEqual([]);
  });

  it("없는 기존 UUID는 신규 INSERT로 바꾸지 않는다", async () => {
    const response = await POST(request({
      quoteId: "quote-missing", quoteNumber: "PCQ-MISSING", hospitalName: "사라진 견적",
      clientId: null, workflowRunId: null,
    }));
    expect(response.status).toBe(404);
    expect(insertedCount).toBe(0);
  });

  it("조회와 UPDATE 사이의 경쟁도 조건부 UPDATE 실패로 차단한다", async () => {
    existingRow = existing();
    updateResult = null;
    const response = await POST(request({
      quoteId: "quote-b", quoteNumber: "PCQ-B", hospitalName: "B병원",
      clientId: "client-b", workflowRunId: "run-b", lastKnownUpdatedAt: existingRow.updated_at,
    }));
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({ ok: false, conflictDetected: true });
    expect(updatedIds).toEqual(["quote-b"]);
  });
});
