import { describe, expect, it } from "vitest";
import { getDocumentOpenTarget } from "@/lib/olivia/documents/openDocument";
import { contextFromHref, createGeneralWindowContext, mergeDefinedWindowContext, prepareWindowContextForLaunch } from "@/lib/olivia/desktop/windowContext";

describe("document opening", () => {
  it.each([
    ["견적서", "quote", "/quote?resourceId=quote-1", "quote-1"],
    ["계약서", "contract", "/contract?resourceId=contract-1", "contract-1"],
    ["콘티", "storyboard", "/conti?resourceId=conti-1", "conti-1"],
    ["메모", "memo", "/memo?resourceId=memo-1", "memo-1"],
    ["갤러리", "gallery", "/gallery?galleryId=gallery-1", "gallery-1"],
    ["셀렉갤러리", "gallery", "/select-galleries/select-1", "select-1"],
    ["후기", "review", "/review-studio?reviewId=review-1", "review-1"],
  ] as const)("%s 카드는 해당 문서의 창 열기 정보만 만든다", (title, type, route, sourceId) => {
    expect(getDocumentOpenTarget({ title, type, route, sourceId })).toEqual({
      href: route,
      title,
      context: { resourceId: sourceId, resourceType: type },
    });
  });

  it("route가 없는 문서는 열기 대상을 만들지 않는다", () => {
    expect(getDocumentOpenTarget({ title: "열 수 없는 문서", type: "other", route: null })).toBeNull();
  });

  it("호출 context의 undefined가 URL에서 찾은 resourceId를 지우지 않는다", () => {
    const hrefContext = contextFromHref("/quote?resourceId=quote-from-route");
    expect(mergeDefinedWindowContext(hrefContext, { resourceId: undefined, resourceType: "quote" })).toEqual({
      resourceId: "quote-from-route",
      resourceType: "quote",
    });
  });

  it("reviewId, galleryId와 셀렉 갤러리 상세 경로도 문서 resourceId로 해석한다", () => {
    expect(contextFromHref("/review-studio?reviewId=review-1").resourceId).toBe("review-1");
    expect(contextFromHref("/gallery?galleryId=gallery-1").resourceId).toBe("gallery-1");
    expect(contextFromHref("/select-galleries/gallery-2").resourceId).toBe("gallery-2");
  });

  it("계약서 생성용 quoteId는 기존 계약서 resourceId와 분리한다", () => {
    expect(contextFromHref("/contract?sourceQuoteId=quote-1")).toEqual({
      clientId: undefined,
      projectId: undefined,
      workflowRunId: undefined,
      sourceQuoteId: "quote-1",
      resourceId: undefined,
    });
  });

  it("분석 앱 창에서도 workflowRunId를 별도 context로 보존한다", () => {
    const context = contextFromHref("/channel-analyzer?clientId=client-1&workflowRunId=run-1");
    expect(context.clientId).toBe("client-1");
    expect(context.projectId).toBe("run-1");
    expect(context.workflowRunId).toBe("run-1");
  });

  it("일반 실행은 URL의 이전 고객·촬영 건·문서 대상을 제거하고 새 요청으로 만든다", () => {
    const context = createGeneralWindowContext("/quote?clientId=old&workflowRunId=run-old&resourceId=quote-old&tab=form");
    expect(context).toMatchObject({ contextScope: "none", launchIntent: "new", targetVerified: false, routeHref: "/quote?tab=form" });
    expect(context.clientId).toBeUndefined();
    expect(context.resourceId).toBeUndefined();
  });

  it("정확한 문서 열기와 고객 지정 새 작성을 서로 다른 진입 의도로 표시한다", () => {
    expect(prepareWindowContextForLaunch({ routeHref: "/quote?resourceId=quote-b", resourceId: "quote-b" }, "quote"))
      .toMatchObject({ contextScope: "document", launchIntent: "document", documentId: "quote-b", targetVerified: false });
    expect(prepareWindowContextForLaunch({ routeHref: "/quote?clientId=client-a", clientId: "client-a" }, "quote"))
      .toMatchObject({ contextScope: "client", launchIntent: "client-new", clientId: "client-a", targetVerified: false });
  });
});
