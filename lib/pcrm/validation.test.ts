import { describe, expect, it } from "vitest";
import { validatePcrmProjectInput } from "./validation";

describe("PCRM 프로젝트 입력 검증", () => {
  it("정상 프로젝트 입력을 허용한다", () => {
    const result = validatePcrmProjectInput({
      projectName: "2026 브랜드 촬영",
      startDate: "2026-07-25",
      expectedCompletionDate: "2026-08-25",
      expectedContractAmount: 12000000,
    });
    expect(result.ok).toBe(true);
  });

  it("시작일이 완료일보다 늦으면 거부한다", () => {
    const result = validatePcrmProjectInput({
      projectName: "브랜드 촬영",
      startDate: "2026-09-01",
      expectedCompletionDate: "2026-08-01",
    });
    expect(result).toEqual({ ok: false, error: "시작일은 예상 완료일보다 늦을 수 없습니다." });
  });

  it("빈 프로젝트명을 거부한다", () => {
    expect(validatePcrmProjectInput({ projectName: " " }).ok).toBe(false);
  });
});
