import { describe, expect, it } from "vitest";
import { formatCustomItemDetail } from "@/lib/quote/formatQuoteDetail";

describe("formatCustomItemDetail", () => {
  it("추가항목 메모의 비어있지 않은 모든 줄에 한 번씩만 하이픈을 붙인다", () => {
    expect(formatCustomItemDetail("1부 촬영\n2부 촬영\n포토존 촬영")).toBe("- 1부 촬영\n- 2부 촬영\n- 포토존 촬영");
  });

  it("이미 입력한 불릿과 빈 줄은 중복 표시하지 않는다", () => {
    expect(formatCustomItemDetail("- 1부 촬영\n\n• 2부 촬영\n  - 포토존 촬영")).toBe("- 1부 촬영\n- 2부 촬영\n- 포토존 촬영");
  });
});
