import { describe, expect, it } from "vitest";
import { isOptionalClientDetailColumnMissing, withClientDetailDefaults } from "@/lib/clientDetailFallback";

describe("고객 상세 PER 컬럼 폴백", () => {
  it("선택 PER 컬럼 누락만 폴백 대상으로 판정한다", () => {
    expect(isOptionalClientDetailColumnMissing({ code: "42703", message: "column clients.total_paid_amount does not exist" })).toBe(true);
    expect(isOptionalClientDetailColumnMissing({ code: "PGRST204", message: "Could not find the 'available_points' column" })).toBe(true);
    expect(isOptionalClientDetailColumnMissing({ code: "42501", message: "permission denied for clients" })).toBe(false);
    expect(isOptionalClientDetailColumnMissing({ code: "42703", message: "column clients.hospital_name does not exist" })).toBe(false);
  });

  it("누락 PER 값에 안전한 기본값을 채운다", () => {
    expect(withClientDetailDefaults({ id: "client-1", hospital_name: "반포리움성형외과" })).toMatchObject({
      total_paid_amount: 0,
      available_points: 0,
      total_earned_points: 0,
      reward_tier: "standard",
    });
  });

  it("DB에 저장된 PER 값은 덮어쓰지 않는다", () => {
    expect(withClientDetailDefaults({ total_paid_amount: 1500000, available_points: 120, total_earned_points: 300, reward_tier: "silver" })).toMatchObject({
      total_paid_amount: 1500000,
      available_points: 120,
      total_earned_points: 300,
      reward_tier: "silver",
    });
  });
});
