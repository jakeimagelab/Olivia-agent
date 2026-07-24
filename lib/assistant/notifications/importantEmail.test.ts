import { describe, expect, it } from "vitest";
import { classifyImportantEmail } from "@/lib/assistant/notifications/importantEmail";

describe("important email classification", () => {
  it("classifies urgent complaint mail as critical", () => {
    expect(
      classifyImportantEmail({
        subject: "긴급: 고객 컴플레인 확인 요청",
      }),
    ).toBe("CRITICAL");
  });

  it("classifies quote and payment mail as high", () => {
    expect(
      classifyImportantEmail({
        subject: "견적서 확인",
        snippet: "입금 일정을 알려주세요.",
      }),
    ).toBe("HIGH");
  });

  it("ignores ordinary mail", () => {
    expect(classifyImportantEmail({ subject: "주간 뉴스레터" })).toBeNull();
  });
});
