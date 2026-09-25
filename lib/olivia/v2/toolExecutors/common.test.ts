import { describe, expect, it } from "vitest";
import { activeResource, normalizeWorkspaceResourceId, requireClientTarget } from "./common";
import type { OliviaContextSnapshot } from "../types";

const emptyContext: OliviaContextSnapshot = { recentActions: [], revision: 0 };

// PHASE 4 작업 4(2026-09-25) — quote/contract/conti/analysis executor 4곳에 흩어져 있던
// "고객을 먼저 알려주세요" 가드를 한 곳으로 모은 공용 함수.
describe("requireClientTarget", () => {
  it("명시적 이름이 있으면 그대로 통과시킨다", () => {
    expect(requireClientTarget(emptyContext, "기통찬의원", "견적서")).toEqual({ ok: true, clientName: "기통찬의원" });
  });

  it("명시 이름이 없어도 context의 activeClientName을 쓴다", () => {
    const context: OliviaContextSnapshot = { ...emptyContext, activeClientName: "연세라이프구강내과" };
    expect(requireClientTarget(context, undefined, "계약서")).toEqual({ ok: true, clientName: "연세라이프구강내과" });
  });

  it("둘 다 없으면 실패하고, 최근 언급된 고객 후보를 함께 제시한다", () => {
    const context: OliviaContextSnapshot = {
      ...emptyContext,
      recentEntities: [
        { type: "client", id: "c1", name: "기통찬의원", lastMentionedAt: "2026-09-25T00:00:00.000Z" },
        { type: "project", id: "p1", name: "9월 촬영", lastMentionedAt: "2026-09-25T00:00:01.000Z" },
        { type: "client", id: "c2", name: "연세라이프구강내과", lastMentionedAt: "2026-09-25T00:00:02.000Z" },
        { type: "client", id: "c3", name: "통증클리닉", lastMentionedAt: "2026-09-25T00:00:03.000Z" },
      ],
    };
    const result = requireClientTarget(context, undefined, "견적서");
    expect(result).toEqual({
      ok: false,
      message: "어떤 고객의 견적서인가요?\n최근: 기통찬의원 · 연세라이프구강내과 · 통증클리닉",
    });
  });

  it("후보가 없으면 후보 목록 없이 되묻기만 한다", () => {
    expect(requireClientTarget(emptyContext, undefined, "콘티")).toEqual({ ok: false, message: "어떤 고객의 콘티인가요?" });
  });
});

describe("workspace resource ids", () => {
  it("unwraps a matching document-search id", () => {
    expect(normalizeWorkspaceResourceId("quote:quote-id", "quote")).toBe("quote-id");
    expect(normalizeWorkspaceResourceId("storyboard:conti-id", "conti")).toBe("conti-id");
  });

  it("does not unwrap a mismatched document type", () => {
    expect(normalizeWorkspaceResourceId("contract:contract-id", "quote")).toBe("contract:contract-id");
  });

  it("uses a searched quote as the active quote without passing the composite id to the database", () => {
    expect(activeResource({
      ...emptyContext,
      currentDocumentType: "quote",
      currentDocumentId: "quote:quote-id",
    }, "quote")).toBe("quote-id");
  });

  it("accepts storyboard as the document-search alias for the conti workspace", () => {
    expect(activeResource({
      ...emptyContext,
      currentDocumentType: "storyboard",
      currentDocumentId: "storyboard:conti-id",
    }, "conti")).toBe("conti-id");
  });
});
