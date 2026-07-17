import { describe, expect, it } from "vitest";
import { calculatePriorityScore, getNotificationPolicy, getPriorityLevel } from "@/lib/olivia/scoring";

describe("Olivia priority scoring", () => {
  it("applies the approved weighted formula", () => {
    expect(calculatePriorityScore({ urgencyScore: 100, impactScore: 80, customerRiskScore: 60, revenueScore: 40 })).toBe(77);
  });
  it("clamps invalid ranges and maps policies", () => {
    expect(calculatePriorityScore({ urgencyScore: 200, impactScore: -20, customerRiskScore: 100, revenueScore: 100 })).toBe(70);
    expect(getPriorityLevel(80)).toBe("urgent");
    expect(getNotificationPolicy(60)).toBe("daily");
    expect(getNotificationPolicy(39)).toBe("record_only");
  });
});
