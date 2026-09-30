import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("QuoteBuilder 저장 견적 불러오기", () => {
  it("저장된 결제조건을 구조화된 폼과 기존 행 경로 모두에서 복원한다", () => {
    const source = readFileSync("components/quote/QuoteBuilder.tsx", "utf8");
    expect(source).toContain("setDepositRate(data.formState.depositRate ?? data.depositRate);");
    expect(source).toContain("setDepositRate(data.depositRate ?? 50);");
  });
});
