import { describe, expect, it } from "vitest";

// resolve_quote_client — 견적서 마법사가 최종 승인 요청 직전에 호출해 병원명으로 등록된 고객을
// 찾는다(견적서 UX 개편, 2026-08-31). 0/1/다건 매치 분기와 이미 연결된 경우의 조기 반환만
// 확인한다 — 실제 매칭 로직(fuzzy 비교)은 lib/olivia/tools/quoteClientLink.ts의
// resolveQuoteClient()에 있고, 이 테스트는 toolExecutor.ts의 도구 배선(quoteId 파라미터 처리,
// context.activeResourceId 대체)까지 함께 검증한다.

let quoteRow: Record<string, unknown>;
let clientRows: Array<{ id: string; hospital_name: string }>;

vi.mock("@/lib/supabase", () => ({
  getSupabaseAdmin: () => ({
    from: (table: string) => {
      if (table === "quotes") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: quoteRow, error: null }),
            }),
          }),
        };
      }
      if (table === "clients") {
        return {
          select: () => ({
            limit: async () => ({ data: clientRows, error: null }),
          }),
        };
      }
      throw new Error(`unexpected table in test mock: ${table}`);
    },
  }),
}));

import { executeAgentTool } from "@/lib/olivia/v2/toolExecutor";
import type { OliviaContextSnapshot } from "@/lib/olivia/v2/types";

const context: OliviaContextSnapshot = { recentActions: [], revision: 0, activeWorkspace: "quote", activeResourceId: "quote-1" };

function callResolveQuoteClient(quoteId: string | null = null) {
  return executeAgentTool({ id: "resolve-call", name: "resolve_quote_client", arguments: JSON.stringify({ quoteId }) }, context);
}

describe("resolve_quote_client", () => {
  it("이미 client_id가 있으면 검색 없이 already_linked를 반환한다", async () => {
    quoteRow = { id: "quote-1", hospital_name: "유진스의원", client_id: "existing-1" };
    clientRows = [];
    const execution = await callResolveQuoteClient();
    expect(execution.result.success).toBe(true);
    expect(execution.result.data?.status).toBe("already_linked");
  });

  it("일치하는 고객이 없으면 no_match를 반환한다", async () => {
    quoteRow = { id: "quote-1", hospital_name: "완전히새로운병원", client_id: null };
    clientRows = [{ id: "c1", hospital_name: "다른의원" }];
    const execution = await callResolveQuoteClient();
    expect(execution.result.data?.status).toBe("no_match");
    expect(execution.result.data?.candidates).toEqual([]);
  });

  it("접미사만 다른 고객 1명이 있으면 match를 반환한다", async () => {
    quoteRow = { id: "quote-1", hospital_name: "유진스의원", client_id: null };
    clientRows = [{ id: "c1", hospital_name: "유진스병원" }];
    const execution = await callResolveQuoteClient();
    expect(execution.result.data?.status).toBe("match");
    expect(execution.result.data?.candidates).toEqual([{ id: "c1", hospital_name: "유진스병원" }]);
  });

  it("비슷한 후보가 여러 명이면 ambiguous를 반환한다", async () => {
    quoteRow = { id: "quote-1", hospital_name: "유진스의원", client_id: null };
    clientRows = [
      { id: "c1", hospital_name: "유진스병원 강남점" },
      { id: "c2", hospital_name: "유진스의원 신사점" },
    ];
    const execution = await callResolveQuoteClient();
    expect(execution.result.data?.status).toBe("ambiguous");
    expect((execution.result.data?.candidates as unknown[]).length).toBe(2);
  });

  it("quoteId를 안 주면 context.activeResourceId를 쓴다", async () => {
    quoteRow = { id: "quote-1", hospital_name: "유진스의원", client_id: "existing-1" };
    clientRows = [];
    const execution = await callResolveQuoteClient(null);
    expect(execution.result.success).toBe(true);
    expect(execution.result.data?.resourceId).toBe("quote-1");
  });
});
