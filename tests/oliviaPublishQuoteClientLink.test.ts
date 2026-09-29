import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// publish_quote는 고객을 자동 등록하지 않는다. resolveQuoteWorkflowLink가 기존 고객을
// 정확히 매칭할 때만 공개를 계속하고, 미연결 고객은 명시적 고객등록 요청에서만 만든다.

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

describe("publish_quote — 고객 자동 등록 금지", () => {
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

  it("발행 전 연결이 없더라도 고객을 새로 등록했다고 추측해 보고하지 않는다", async () => {
    publishQuoteServiceMock.mockResolvedValueOnce({ ok: true, clientId: "new-client-1", workflowRunId: "run-1", portalUrl: "https://example.com/portal/abc", publicationId: "pub-1", resource: quoteRow });

    const execution = await callPublishQuote();
    expect(execution.result.success).toBe(true);
    const summary = String(execution.result.data?.summary);
    expect(summary).toContain("유진스의원 견적서가 완성되었습니다.");
    expect(summary).toContain("스탠다드 패키지");
    expect(summary).not.toMatch(/신규 고객으로 등록했어요/);
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
    const summary = String(execution.result.data?.summary);
    expect(summary).not.toMatch(/신규 고객으로 등록했어요/);
    expect(summary).toContain("유진스의원 견적서가 완성되었습니다.");
    expect(summary).toContain("최종 금액: 1,350,000원");
  });

  it("발행 자체가 실패하면 success:false로 서버 사유를 그대로 보고한다", async () => {
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
