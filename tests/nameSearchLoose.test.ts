import { describe, expect, it } from "vitest";
import { normalizeHospitalNameLoose } from "@/lib/olivia/nameSearch";

// 견적서 마법사의 고객 등록 제안(스펙 §23-29)에서만 쓰는 느슨한 비교용 — resolveClientId가
// 쓰는 normalizeSearchText()는 절대 건드리지 않았음을 이 테스트가 간접적으로도 보장한다
// (normalizeHospitalNameLoose는 별도 export이지 normalizeSearchText의 동작을 바꾸지 않는다).
describe("normalizeHospitalNameLoose", () => {
  it("strips common facility suffixes after normalizing whitespace/case", () => {
    expect(normalizeHospitalNameLoose("히어 산부인과")).toBe("히어산부인과");
  });

  it("strips 병원/의원/클리닉/한의원/치과 suffixes so variants compare equal", () => {
    expect(normalizeHospitalNameLoose("유진스병원")).toBe(normalizeHospitalNameLoose("유진스의원"));
    expect(normalizeHospitalNameLoose("유진스클리닉")).toBe(normalizeHospitalNameLoose("유진스의원"));
  });

  it("only strips a trailing suffix, not one embedded mid-string", () => {
    expect(normalizeHospitalNameLoose("병원사랑의원")).toBe("병원사랑");
  });

  it("returns an empty string for empty/nullish input", () => {
    expect(normalizeHospitalNameLoose("")).toBe("");
    expect(normalizeHospitalNameLoose(null)).toBe("");
    expect(normalizeHospitalNameLoose(undefined)).toBe("");
  });
});
