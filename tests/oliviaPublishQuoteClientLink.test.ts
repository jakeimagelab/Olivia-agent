import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// publish_quote(app/api/quotes/[id]/publish/route.ts를 통해)는 resolveQuoteWorkflowLink()로
// 고객 매칭/자동생성을 이미 동기적으로 끝낸 뒤에야 성공 응답을 준다 — "등록할까요?"라고 물어볼
// 시점이 없다(PHASE 2 스펙 §31이 기대한 승인 카드를 붙일 지점이 없음을 조사로 확인). 대신
// 발행 전/후 client_id를 비교해 이번 발행에서 새로 연결/생성됐는지 판단하고, 그 결과를
// data.summary에 담아 정확히 한 번 알려준다 — publish_quote는 QUOTE_MUTATION_TOOLS에 있어서
// 이 summary가 모델 자유 텍스트 대신 그대로 채팅에 나간다(lib/olivia/output/quoteConfirmations.ts).

let quoteRow: { id: string; hospital_name: string; client_id: string | null; items?: unknown; discount_amount?: number; total_amount?: number };
const publishQuoteServiceMock = vi.hoisted(() => vi.fn());
const archiveWorkflowPdfMock = vi.hoisted(() => vi.fn());

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
vi.mock("@/lib/publications/publishResource", () => ({ publishQuoteService: publishQuoteServiceMock }));
vi.mock("@/lib/workflowArtifacts/archivePdf", () => ({ archiveWorkflowPdf: archiveWorkflowPdfMock }));
vi.mock("@/lib/quote/renderQuotePdf", () => ({ renderQuoteBuffer: vi.fn(async () => ({ buffer: Buffer.from("pdf") })) }));

import { executeAgentTool } from "@/lib/olivia/v2/toolExecutor";
import type { OliviaContextSnapshot } from "@/lib/olivia/v2/types";

const context: OliviaContextSnapshot = { recentActions: [], revision: 0, activeWorkspace: "quote", activeResourceId: "quote-1" };

function callPublishQuote() {
  return executeAgentTool({ id: "publish-call", name: "publish_quote", arguments: "{}" }, context);
}

describe("publish_quote — 발행 직후 신규 고객 등록 여부 보고", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    publishQuoteServiceMock.mockReset();
    archiveWorkflowPdfMock.mockReset().mockResolvedValue({ id: "artifact-1", status: "ready" });
    global.fetch = vi.fn(async () => ({ ok: true, json: async () => ({ ok: true, artifact: { id: "artifact-1" } }) })) as unknown as typeof fetch;
    quoteRow = {
      id: "quote-1", hospital_name: "유진스의원", client_id: null,
      items: [{ name: "스탠다드 패키지", detail: "프로필 + 연출사진" }],
      discount_amount: 0, total_amount: 1_350_000,
    };
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("발행 전 client_id가 없었고 발행 후 새로 생겼으면 신규 등록 사실을 summary에 포함한다", async () => {
    publishQuoteServiceMock.mockResolvedValueOnce({ ok: true, clientId: "new-client-1", workflowRunId: "run-1", portalUrl: "https://example.com/portal/abc", publicationId: "pub-1", resource: quoteRow });

    const execution = await callPublishQuote();
    expect(execution.result.success).toBe(true);
    expect(execution.result.data?.newlyLinkedClientId).toBe("new-client-1");
    const summary = String(execution.result.data?.summary);
    expect(summary).toContain("유진스의원 견적서가 완성되었습니다.");
    expect(summary).toContain("스탠다드 패키지");
    expect(summary).toContain("유진스의원을 신규 고객으로 등록했어요.");
  });

  it("발행 전에 이미 client_id가 연결돼 있었으면 신규 등록 문구를 붙이지 않는다", async () => {
    quoteRow = {
      id: "quote-1", hospital_name: "유진스의원", client_id: "existing-client-1",
      items: [{ name: "스탠다드 패키지", detail: "프로필 + 연출사진" }],
      discount_amount: 0, total_amount: 1_350_000,
    };
    publishQuoteServiceMock.mockResolvedValueOnce({ ok: true, clientId: "existing-client-1", workflowRunId: "run-1", portalUrl: "https://example.com/portal/abc", publicationId: "pub-1", resource: quoteRow });

    const execution = await callPublishQuote();
    expect(execution.result.success).toBe(true);
    expect(execution.result.data?.newlyLinkedClientId).toBeUndefined();
    const summary = String(execution.result.data?.summary);
    expect(summary).not.toMatch(/신규 고객으로 등록했어요/);
    expect(summary).toContain("유진스의원 견적서가 완성되었습니다.");
    expect(summary).toContain("최종 금액: 1,350,000원");
  });

  it("발행 자체가 실패하면(ok:false) success:false로 실패를 그대로 보고한다 — 신규 등록 판단 로직이 실패를 가리지 않는다", async () => {
    publishQuoteServiceMock.mockRejectedValueOnce(new Error("이미 처리 중인 견적입니다."));

    const execution = await callPublishQuote();
    expect(execution.result.success).toBe(false);
    expect(execution.result.error).toMatch(/이미 처리 중인 견적입니다/);
  });

  it("공개 후 PDF 아카이브가 실패하면 전체 성공 대신 부분 성공으로 보고한다", async () => {
    publishQuoteServiceMock.mockResolvedValueOnce({ ok: true, clientId: "new-client-1", workflowRunId: "run-1", portalUrl: "https://example.com/portal/abc", publicationId: "pub-1", resource: quoteRow });
    archiveWorkflowPdfMock.mockRejectedValueOnce(new Error("archive failed"));
    const execution = await callPublishQuote();
    expect(execution.result).toMatchObject({ success: false, code: "PARTIAL_SUCCESS", verification: { persisted: false } });
  });
});
