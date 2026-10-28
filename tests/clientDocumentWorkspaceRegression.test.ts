import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ACTIVE_WORKFLOW_STEPS } from "@/lib/workflow";
import { resolveRequiredFollowupTool } from "@/lib/olivia/v2/toolSelection";
import { normalizeCalendarComparable, verifyCalendarFields } from "@/lib/olivia/v2/toolExecutors/calendar";
import { withoutPersistedDocumentTarget } from "@/lib/store/useOliviaDesktopStore";
import { CLIENT_CHAT_TOOLS } from "@/lib/olivia/clientChatTools";

function source(relativePath: string): string {
  return readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

describe("고객 문서 워크스페이스 회귀 방지", () => {
  it("마지막 문서 ID는 데스크톱 세션에 남기지 않는다", () => {
    expect(withoutPersistedDocumentTarget({
      clientId: "client-1",
      workflowRunId: "run-1",
      resourceId: "quote-1",
      documentId: "quote-1",
      documentType: "quote",
      sourceQuoteId: "quote-source-1",
      routeHref: "/quote?resourceId=quote-1&sourceQuoteId=quote-source-1",
    })).toEqual({ clientId: "client-1", workflowRunId: "run-1", documentType: "quote" });
  });

  it("직전 일정 대화 때문에 현재 견적 요청에 일정 도구를 강제하지 않는다", () => {
    expect(resolveRequiredFollowupTool({
      message: "견적서 열어줘",
      recentText: "10월 28일 촬영 일정을 등록해줘",
      availableToolNames: ["calendar_add", "calendar_add_bulk", "get_quote"],
    })).toBeUndefined();
  });

  it("현재 메시지가 일정 등록이면 일정 도구를 고른다", () => {
    expect(resolveRequiredFollowupTool({
      message: "10월 28일 촬영 일정을 등록해줘",
      recentText: "견적서 열어줘",
      availableToolNames: ["calendar_add"],
    })).toBe("calendar_add");
  });

  it("일정 검증에서 빈 문자열과 null을 같은 값으로 본다", () => {
    expect(normalizeCalendarComparable("")).toBeNull();
    expect(() => verifyCalendarFields(
      { date: "2026-10-28", title: "촬영", memo: null },
      { date: "2026-10-28", title: "촬영", memo: "" },
    )).not.toThrow();
  });

  it("화면 진행 바는 활성 12단계만 쓴다", () => {
    expect(ACTIVE_WORKFLOW_STEPS).toHaveLength(12);
    expect(ACTIVE_WORKFLOW_STEPS.map((step) => step.key)).toContain("client_selection");
    expect(ACTIVE_WORKFLOW_STEPS.map((step) => step.key)).toContain("raw_matching");
    expect(ACTIVE_WORKFLOW_STEPS.map((step) => step.key)).toContain("payment_confirm");
  });

  it("고객 채팅에는 요청서의 고정 도구 목록만 제공한다", () => {
    expect(CLIENT_CHAT_TOOLS.map((tool) => tool.name)).toEqual([
      "create_contract", "update_contract_terms", "request_contract_signature", "request_contract_publish",
      "update_quote_item", "add_quote_item", "remove_quote_item", "update_quote_info",
      "update_quote_payment_terms", "apply_quote_discount", "preview_quote", "request_quote_publish",
      "calendar_list", "calendar_add", "calendar_update", "client_get", "client_update", "get_quote", "get_contract",
    ]);
  });

  it("고객 작업창만 전체 폭을 쓰고 목록과 일반 견적 화면의 폭 상한은 유지한다", () => {
    const workspaceStyles = source("components/clients/ClientDocumentWorkspace.module.css");
    const quoteBuilder = source("components/quote/QuoteBuilder.tsx");

    expect(workspaceStyles).toContain(".listPage{width:min(1380px,100%)");
    expect(workspaceStyles).toContain(".casePage{width:100%");
    expect(quoteBuilder).toContain('documentOnly ? "" : "mx-auto max-w-[1500px]"');
    expect(quoteBuilder).toContain('documentOnly ? "md:grid-cols-[minmax(320px,420px)_minmax(340px,1fr)]"');
  });
});
