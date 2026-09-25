import { describe, expect, it } from "vitest";
import { contextPrompt, normalizeContext } from "@/lib/olivia/v2/stream/contextPrompt";

describe("Olivia Page Context completion and publication capabilities", () => {
  it("allows portal publication while blocking internal completion", () => {
    const context = normalizeContext({ canComplete: false, canPublish: true });
    const prompt = contextPrompt(context);

    expect(prompt).toContain("현재 내부 최종완료 가능: 아니오");
    expect(prompt).toContain("현재 포털 공개 가능: 예");
    expect(prompt).toContain("현재 문서의 내부 최종완료 Tool을 실행하지 않는다.");
    expect(prompt).not.toContain("현재 문서의 고객 포털 공개 Tool을 실행하지 않는다.");
  });

  it("allows internal completion while blocking portal publication", () => {
    const context = normalizeContext({ canComplete: true, canPublish: false });
    const prompt = contextPrompt(context);

    expect(prompt).toContain("현재 내부 최종완료 가능: 예");
    expect(prompt).toContain("현재 포털 공개 가능: 아니오");
    expect(prompt).not.toContain("현재 문서의 내부 최종완료 Tool을 실행하지 않는다.");
    expect(prompt).toContain("현재 문서의 고객 포털 공개 Tool을 실행하지 않는다.");
  });

  it("uses canFinalize only as a legacy fallback", () => {
    const context = normalizeContext({ canFinalize: false });
    const prompt = contextPrompt(context);

    expect(prompt).toContain("현재 내부 최종완료 가능: 아니오");
    expect(prompt).toContain("현재 포털 공개 가능: 아니오");
    expect(prompt).toContain("현재 문서의 내부 최종완료 Tool을 실행하지 않는다.");
    expect(prompt).toContain("현재 문서의 고객 포털 공개 Tool을 실행하지 않는다.");
  });
});
