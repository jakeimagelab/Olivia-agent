import { describe, expect, it } from "vitest";
import { resolveDocumentBrand } from "@/lib/olivia/brandResolver";

describe("resolveDocumentBrand", () => {
  it.each([
    "라움피부과 견적서 만들어줘",
    "서울의원 계약서 초안 작성해줘",
    "OO병원 콘티 만들어줘",
    "치과 촬영 제안서를 만들어줘",
    "환자 진료 장면 문서로 정리해줘",
  ])("의료 문맥은 포토클리닉으로 자동 판별한다: %s", (message) => {
    expect(resolveDocumentBrand({ message })).toBe("photoclinic");
  });

  it("현재 요청에서 명시한 제이크이미지는 의료 문맥보다 우선한다", () => {
    expect(resolveDocumentBrand({
      message: "제이크이미지로 피부과 견적 만들어줘",
      contextBrand: "photoclinic",
    })).toBe("jakeimage");
  });

  it("현재 요청에서 명시한 포토클리닉은 기존 제이크이미지 Context보다 우선한다", () => {
    expect(resolveDocumentBrand({
      message: "포토클리닉으로 문서 만들어줘",
      contextBrand: "jakeimage",
    })).toBe("photoclinic");
  });

  it("명시 브랜드가 없으면 실제 PageContext 브랜드를 유지한다", () => {
    expect(resolveDocumentBrand({
      message: "이 견적으로 계약서 만들어줘",
      contextBrand: "jakeimage",
    })).toBe("jakeimage");
  });

  it("선택된 고객명에서도 의료 문맥을 판별한다", () => {
    expect(resolveDocumentBrand({
      message: "견적서 만들어줘",
      activeClientName: "더봄산부인과",
    })).toBe("photoclinic");
  });

  it("일반 기업·개인 촬영 문맥은 브랜드를 추측하지 않는다", () => {
    expect(resolveDocumentBrand({ message: "대표 프로필 촬영 견적서 만들어줘" })).toBeUndefined();
    expect(resolveDocumentBrand({ message: "학원 원장 프로필 견적 만들어줘" })).toBeUndefined();
  });
});
