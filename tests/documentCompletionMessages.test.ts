import { describe, expect, it } from "vitest";
import {
  contiCompletionSummary,
  contractCompletionSummary,
} from "@/lib/olivia/v2/completionMessages";

describe("document completion chat messages", () => {
  it("describes a new contract transition only for a non-idempotent completion", () => {
    expect(contractCompletionSummary({ currentStepName: "콘티 작성 / 전달" })).toContain("이동했어요");
    expect(contractCompletionSummary({ idempotent: true, currentStepName: "촬영" }))
      .toBe("이미 최종완료된 계약서예요. 현재 프로젝트는 촬영 단계입니다.");
  });

  it("describes a new conti transition only for a non-idempotent completion", () => {
    expect(contiCompletionSummary({ currentStepName: "촬영" })).toContain("이동했어요");
    expect(contiCompletionSummary({ idempotent: true, currentStepName: "백업 및 분류" }))
      .toBe("이미 최종완료된 콘티예요. 현재 프로젝트는 백업 및 분류 단계입니다.");
  });
});
