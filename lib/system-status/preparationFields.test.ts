import { describe, expect, it } from "vitest";
import { missingPreparationSummary } from "./preparationFields";

describe("missingPreparationSummary", () => {
  it("내부 필드명 대신 준비되지 않은 촬영 항목 수만 안내한다", () => {
    expect(missingPreparationSummary([
      "contiApproved", "contractApproved", "depositConfirmed", "hasModel", "location",
      "medicalStaffCount", "parkingInfo", "shootingItems", "shootingTime",
    ])).toBe("촬영 준비 항목 9개가 비어 있습니다.");
  });
});
