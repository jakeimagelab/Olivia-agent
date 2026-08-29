import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// publish_contract는 스펙 §28(최소 확인: 고객명/계약금액/촬영일/서명)을 도구 안에서 먼저 검증한
// 뒤 기존 /api/contracts/[id]/publish 라우트를 그대로 호출한다(고객/프로젝트 연결 검증은 그
// 라우트가 이미 함 — 중복 구현하지 않는다는 PHASE 3 계획을 그대로 검증).

let contractRow: Record<string, any>;

function queryFor(table: string) {
  const row = table === "contracts" ? contractRow : null;
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    update: vi.fn((payload: Record<string, unknown>) => {
      if (row) Object.assign(row, payload);
      return query;
    }),
    single: vi.fn(async () => ({ data: row, error: null })),
    maybeSingle: vi.fn(async () => ({ data: row, error: null })),
  };
  return query;
}

vi.mock("@/lib/supabase", () => ({
  getSupabaseAdmin: () => ({ from: (table: string) => queryFor(table) }),
}));

import { executeAgentTool } from "@/lib/olivia/v2/toolExecutor";
import type { OliviaContextSnapshot } from "@/lib/olivia/v2/types";

const context: OliviaContextSnapshot = { recentActions: [], revision: 0, activeWorkspace: "contract", activeResourceId: "contract-1" };

function callPublishContract() {
  return executeAgentTool({ id: "publish-contract-call", name: "publish_contract", arguments: "{}" }, context);
}

describe("publish_contract — 최종 생성 전 필수 확인(스펙 §28)", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("서명이 없으면 최종 생성하지 않고 부족한 항목을 알려준다", async () => {
    contractRow = {
      id: "contract-1", hospital_name: "유진스의원", signature_data_url: null,
      quote_data: { totalAmount: 1_980_000, shootDate: "2026-09-10" },
    };
    global.fetch = vi.fn();
    const execution = await callPublishContract();
    expect(execution.result.success).toBe(false);
    expect(execution.result.error).toMatch(/대표 서명/);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("촬영 예정일이 없으면 최종 생성하지 않고 부족한 항목을 알려준다", async () => {
    contractRow = {
      id: "contract-1", hospital_name: "유진스의원", signature_data_url: "data:image/png;base64,abc",
      quote_data: { totalAmount: 1_980_000, shootDate: null },
    };
    global.fetch = vi.fn();
    const execution = await callPublishContract();
    expect(execution.result.success).toBe(false);
    expect(execution.result.error).toMatch(/촬영 예정일/);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("필수 항목이 모두 있으면 기존 발행 라우트를 호출하고 status를 final로 바꾼다", async () => {
    contractRow = {
      id: "contract-1", hospital_name: "유진스의원", signature_data_url: "data:image/png;base64,abc",
      quote_data: { totalAmount: 1_980_000, shootDate: "2026-09-10" },
      status: "draft",
    };
    global.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({ ok: true, clientId: "client-1", workflowRunId: "project-1", portalUrl: "https://example.com/portal/abc" }),
    })) as unknown as typeof fetch;

    const execution = await callPublishContract();
    expect(execution.result.success).toBe(true);
    expect(contractRow.status).toBe("final");
    expect(execution.result.data?.summary).toMatch(/최종 생성했어요/);
  });

  it("기존 발행 라우트가 실패하면(고객/프로젝트 미연결 등) 그 에러를 그대로 보고하고 status를 바꾸지 않는다", async () => {
    contractRow = {
      id: "contract-1", hospital_name: "유진스의원", signature_data_url: "data:image/png;base64,abc",
      quote_data: { totalAmount: 1_980_000, shootDate: "2026-09-10" },
      status: "draft",
    };
    global.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({ ok: false, error: "계약서에 연결된 프로젝트가 없습니다. 먼저 견적서를 공개해 프로젝트를 생성해주세요." }),
    })) as unknown as typeof fetch;

    const execution = await callPublishContract();
    expect(execution.result.success).toBe(false);
    expect(execution.result.error).toMatch(/연결된 프로젝트가 없습니다/);
    expect(contractRow.status).toBe("draft");
  });
});
