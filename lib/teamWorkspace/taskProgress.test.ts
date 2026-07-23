import { describe, expect, it } from "vitest";
import { calculateProjectProgress } from "./taskProgress";

describe("calculateProjectProgress", () => {
  it("완료 2건 / 전체 4건을 50%로 계산한다", () => {
    expect(calculateProjectProgress([
      { status: "completed" },
      { status: "completed" },
      { status: "todo" },
      { status: "in_progress" },
    ])).toBe(50);
  });

  it("취소 업무는 계산에서 제외한다", () => {
    expect(calculateProjectProgress([
      { status: "completed" },
      { status: "todo" },
      { status: "canceled" },
      { status: "canceled" },
    ])).toBe(50);
  });

  it("업무가 없으면 0%다", () => {
    expect(calculateProjectProgress([])).toBe(0);
    expect(calculateProjectProgress([{ status: "canceled" }])).toBe(0);
  });
});
