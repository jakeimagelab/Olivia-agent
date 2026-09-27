import { describe, expect, it } from "vitest";
import { enforceCompletionClaims } from "@/lib/olivia/v2/completionClaimGuard";

describe("completion claim guard", () => {
  it("도구 없이 견적서를 열었다는 주장을 차단한다", () => {
    expect(enforceCompletionClaims({ text: "1989 청담스시 견적서 초안을 열었어.", executedTools: [] })).toEqual({
      text: "열지 못했어. 다시 해볼까?",
      unsupported: ["open"],
    });
  });

  it("open_document 성공이 있으면 열기 주장을 통과시킨다", () => {
    const text = "1989 청담스시 견적서를 열었어.";
    expect(enforceCompletionClaims({ text, executedTools: [{ name: "open_document", success: true }] })).toEqual({ text, unsupported: [] });
  });

  it("open_document 실패는 열기 근거가 아니다", () => {
    expect(enforceCompletionClaims({ text: "견적서를 열었어.", executedTools: [{ name: "open_document", success: false }] })).toMatchObject({
      text: "열지 못했어. 다시 해볼까?",
      unsupported: ["open"],
    });
  });

  it("search_documents 성공은 생성 주장의 근거가 아니다", () => {
    expect(enforceCompletionClaims({ text: "견적서를 만들었어.", executedTools: [{ name: "search_documents", success: true }] })).toMatchObject({
      text: "만들지 못했어. 다시 해볼까?",
      unsupported: ["create"],
    });
  });

  it("검색 사실은 남기고 검색만으로 만든 열기 주장은 제거한다", () => {
    expect(enforceCompletionClaims({
      text: "초안이 5개 있어.\n가장 최근 것을 열었어.",
      executedTools: [{ name: "search_documents", success: true }],
    })).toEqual({
      text: "초안이 5개 있어.\n열지 못했어. 다시 해볼까?",
      unsupported: ["open"],
    });
  });

  it("MCP 접두사와 점을 정규화해 update 도구를 인정한다", () => {
    const text = "견적서를 저장했어.";
    expect(enforceCompletionClaims({
      text,
      executedTools: [{ name: "mcp_olivia_update.quote.note", success: true }],
    })).toEqual({ text, unsupported: [] });
  });

  it("질문형은 완료 주장이 아니다", () => {
    const text = "가장 최근 견적서를 열까?";
    expect(enforceCompletionClaims({ text, executedTools: [] })).toEqual({ text, unsupported: [] });
  });

  it("과거 거짓말을 자백하는 인용형은 현재 완료 주장이 아니다", () => {
    const text = "아까는 실행하지 않고 열었다고 말했어.";
    expect(enforceCompletionClaims({ text, executedTools: [] })).toEqual({ text, unsupported: [] });
  });

  it("근거 없는 생성과 전송 주장을 각각 차단한다", () => {
    expect(enforceCompletionClaims({ text: "견적서를 만들었어. 고객에게 보냈어.", executedTools: [] })).toEqual({
      text: "만들지 못했어. 다시 해볼까?\n보내지 못했어. 다시 해볼까?",
      unsupported: ["create", "send"],
    });
  });

  it("존댓말 열기 주장도 차단한다", () => {
    expect(enforceCompletionClaims({ text: "고객 관리 화면을 열었어요.", executedTools: [] })).toMatchObject({
      text: "열지 못했어. 다시 해볼까?",
      unsupported: ["open"],
    });
  });

  it("open_feature 성공이 있으면 존댓말 열기 주장을 통과시킨다", () => {
    const text = "고객 관리 화면을 열었어요.";
    expect(enforceCompletionClaims({ text, executedTools: [{ name: "open_feature", success: true }] })).toEqual({ text, unsupported: [] });
  });
});
