import { describe, expect, it } from "vitest";
import { getDocumentOpenTarget } from "@/lib/olivia/documents/openDocument";
import { contextFromHref, mergeDefinedWindowContext } from "@/lib/olivia/desktop/windowContext";

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

  it("reviewId와 galleryId도 문서 resourceId로 해석한다", () => {
    expect(contextFromHref("/review-studio?reviewId=review-1").resourceId).toBe("review-1");
    expect(contextFromHref("/gallery?galleryId=gallery-1").resourceId).toBe("gallery-1");
  });

  it("분석 앱 창에서도 workflowRunId를 별도 context로 보존한다", () => {
    const context = contextFromHref("/channel-analyzer?clientId=client-1&workflowRunId=run-1");
    expect(context.clientId).toBe("client-1");
    expect(context.projectId).toBe("run-1");
    expect(context.workflowRunId).toBe("run-1");
  });
});
