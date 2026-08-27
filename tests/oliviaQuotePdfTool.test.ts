import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase", () => ({ getSupabaseAdmin: () => ({ from: () => ({}) }) }));
vi.mock("@/lib/olivia/crud/executor", () => ({ executeOliviaCrud: vi.fn() }));

import { executeAgentTool } from "@/lib/olivia/v2/toolExecutor";
import type { OliviaContextSnapshot } from "@/lib/olivia/v2/types";

const baseContext: OliviaContextSnapshot = {
  recentActions: [],
  revision: 1,
};

function call(context: OliviaContextSnapshot) {
  return executeAgentTool({ id: "pdf-call", name: "download_quote_pdf", arguments: "{}" }, context);
}

// download_quote_pdf는 DB를 건드리지 않는다 — PDF는 브라우저에 열려 있는 QuoteBuilder만
// 실제로 만들 수 있어서, 서버는 "지금 견적서 화면이 열려 있는지"만 검증하고 실제 다운로드는
// actionRouter.ts/useOliviaConversationStore.ts가 client에서 이어서 처리한다(Phase 4).
describe("download_quote_pdf tool (server-side gate only)", () => {
  it("견적서가 열려 있지 않으면 DB 조회 없이 즉시 실패한다", async () => {
    const execution = await call(baseContext);
    expect(execution.result.success).toBe(false);
    expect(execution.result.error).toMatch(/견적서를 열어주세요/);
    expect(execution.uiActions).toEqual([]);
  });

  it("다른 워크스페이스(콘티 등)가 열려 있으면 실패한다", async () => {
    const execution = await call({ ...baseContext, activeWorkspace: "conti", activeResourceId: "conti-1" });
    expect(execution.result.success).toBe(false);
  });

  it("견적서가 열려 있으면 성공하고 DOWNLOAD_QUOTE_PDF ui action을 만든다 — 아직 '완료'는 아니다", async () => {
    const execution = await call({ ...baseContext, activeWorkspace: "quote", activeResourceId: "quote-1" });
    expect(execution.result.success).toBe(true);
    expect(execution.result.data?.resourceId).toBe("quote-1");
    // 서버는 "준비 중"만 말한다 — 실제 다운로드 완료 문구는 client의 downloadPdf() 콜백이
    // 끝난 뒤에만 채팅에 별도로 붙는다(false-success 방지, Phase 2/4 공통 원칙).
    expect(execution.result.data?.summary).not.toMatch(/완료|다운로드했/);
    expect(execution.uiActions).toEqual([{ type: "DOWNLOAD_QUOTE_PDF", resourceId: "quote-1" }]);
  });
});
