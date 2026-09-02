import { beforeEach, describe, expect, it } from "vitest";
import { useQuoteWizardChatStore } from "@/lib/store/useQuoteWizardChatStore";

describe("useQuoteWizardChatStore 의료 브랜드 초기화", () => {
  beforeEach(() => {
    useQuoteWizardChatStore.setState({ flows: {} });
  });

  it("브랜드가 확정되지 않으면 기존 브랜드 선택 단계에서 시작한다", () => {
    useQuoteWizardChatStore.getState().startFlow("ambiguous");
    expect(useQuoteWizardChatStore.getState().flows.ambiguous).toMatchObject({
      step: "brand",
      brand: null,
    });
  });

  it("의료 문맥에서 포토클리닉이 확정되면 선택 단계를 건너뛴다", () => {
    useQuoteWizardChatStore.getState().startFlow("medical", "photoclinic");
    expect(useQuoteWizardChatStore.getState().flows.medical).toMatchObject({
      step: "setup",
      brand: "photoclinic",
    });
  });

  it("명시된 제이크이미지도 선택 단계 없이 유지한다", () => {
    useQuoteWizardChatStore.getState().startFlow("jake", "jakeimage");
    expect(useQuoteWizardChatStore.getState().flows.jake).toMatchObject({
      step: "setup",
      brand: "jakeimage",
    });
  });
});
