import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// publish_quote(app/api/quotes/[id]/publish/route.ts를 통해)는 resolveQuoteWorkflowLink()로
// 고객 매칭/자동생성을 이미 동기적으로 끝낸 뒤에야 성공 응답을 준다 — "등록할까요?"라고 물어볼
// 시점이 없다(PHASE 2 스펙 §31이 기대한 승인 카드를 붙일 지점이 없음을 조사로 확인). 대신
// 발행 전/후 client_id를 비교해 이번 발행에서 새로 연결/생성됐는지 판단하고, 그 결과를
// data.summary에 담아 정확히 한 번 알려준다 — publish_quote는 QUOTE_MUTATION_TOOLS에 있어서
// 이 summary가 모델 자유 텍스트 대신 그대로 채팅에 나간다(lib/olivia/output/quoteConfirmations.ts).

let quoteRow: { id: string; hospital_name: string; client_id: string | null };

vi.mock("@/lib/supabase", () => ({
  getSupabaseAdmin: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: quoteRow, error: null }),
        }),
      }),
    }),
  }),
}));

import { executeAgentTool } from "@/lib/olivia/v2/toolExecutor";
import type { OliviaContextSnapshot } from "@/lib/olivia/v2/types";

const context: OliviaContextSnapshot = { recentActions: [], revision: 0, activeWorkspace: "quote", activeResourceId: "quote-1" };

function callPublishQuote() {
  return executeAgentTool({ id: "publish-call", name: "publish_quote", arguments: "{}" }, context);
}

describe("publish_quote — 발행 직후 신규 고객 등록 여부 보고", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    quoteRow = { id: "quote-1", hospital_name: "유진스의원", client_id: null };
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("발행 전 client_id가 없었고 발행 후 새로 생겼으면 신규 등록 사실을 summary에 포함한다", async () => {
    global.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({ ok: true, clientId: "new-client-1", workflowRunId: "run-1", portalUrl: "https://example.com/portal/abc" }),
    })) as unknown as typeof fetch;

    const execution = await callPublishQuote();
    expect(execution.result.success).toBe(true);
    expect(execution.result.data?.newlyLinkedClientId).toBe("new-client-1");
    expect(execution.result.data?.summary).toMatch(/유진스의원.*신규 고객으로 등록했어요/);
  });

  it("발행 전에 이미 client_id가 연결돼 있었으면 신규 등록 문구를 붙이지 않는다", async () => {
    quoteRow = { id: "quote-1", hospital_name: "유진스의원", client_id: "existing-client-1" };
    global.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({ ok: true, clientId: "existing-client-1", workflowRunId: "run-1", portalUrl: "https://example.com/portal/abc" }),
    })) as unknown as typeof fetch;

    const execution = await callPublishQuote();
    expect(execution.result.success).toBe(true);
    expect(execution.result.data?.newlyLinkedClientId).toBeUndefined();
    expect(execution.result.data?.summary).not.toMatch(/신규 고객으로 등록했어요/);
    expect(execution.result.data?.summary).toBe("견적서를 고객 포털에 공개했어요.");
  });

  it("발행 자체가 실패하면(ok:false) 에러를 던진다 — 신규 등록 판단 로직이 실패를 가리지 않는다", async () => {
    global.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({ ok: false, error: "이미 처리 중인 견적입니다." }),
    })) as unknown as typeof fetch;

    await expect(callPublishQuote()).rejects.toThrow(/이미 처리 중인 견적입니다/);
  });
});
