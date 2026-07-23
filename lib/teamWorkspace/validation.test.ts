import { describe, expect, it } from "vitest";
import { validateTaskInput } from "./validation";

describe("team workspace validation", () => {
  it("잘못된 status를 거부한다", () => {
    const result = validateTaskInput({ title: "업무", status: "done_forever" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("업무 상태");
  });

  it("시작일이 마감일보다 늦으면 거부한다", () => {
    const result = validateTaskInput({
      title: "업무",
      startDate: "2026-07-24",
      dueDate: "2026-07-23",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("시작일");
  });

  it("제목 길이와 UUID를 서버 규칙으로 검증한다", () => {
    expect(validateTaskInput({ title: "" }).ok).toBe(false);
    expect(validateTaskInput({ title: "업무", assigneeId: "not-a-uuid" }).ok).toBe(false);
    expect(validateTaskInput({
      title: "업무",
      assigneeId: "11111111-1111-4111-8111-111111111111",
      priority: "urgent",
    }).ok).toBe(true);
  });
});
