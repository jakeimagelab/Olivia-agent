import { afterEach, describe, expect, it, vi } from "vitest";
import { documentStage, documentStatusLabel } from "./status";

describe("문서 상태", () => {
  afterEach(() => vi.restoreAllMocks());

  it.each([
    ["final", "final", "최종본"],
    ["completed", "final", "최종본"],
    ["signed", "final", "최종본"],
    ["published", "final", "발송 완료"],
    ["draft", "draft", "작성 중"],
    ["pending_review", "review", "검토 중"],
    ["linked", "draft", "작성 중"],
    [null, "draft", "작성 중"],
    ["FINAL", "final", "최종본"],
  ] as const)("%s는 %s 단계이며 %s로 표시한다", (status, stage, label) => {
    expect(documentStage(status)).toBe(stage);
    expect(documentStatusLabel(status)).toBe(label);
  });

  it("정의되지 않은 상태는 원문을 보이고 경고한다", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    expect(documentStage("듣도보도못한상태")).toBe("draft");
    expect(documentStatusLabel("듣도보도못한상태")).toBe("듣도보도못한상태");
    expect(warn).toHaveBeenCalledWith("[documents/status] 라벨 없는 상태", "듣도보도못한상태");
  });
});
