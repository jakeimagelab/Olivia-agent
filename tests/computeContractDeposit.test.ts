import { describe, expect, it } from "vitest";
import { computeContractDeposit } from "@/lib/contract/computeContractDeposit";

// 계약금 비율이 채팅으로 바뀌어도(update_contract_terms) LLM이 암산하지 않는다는 원칙(스펙
// §12)을 지키는 유일한 계산 지점 — ContractBuilder.tsx(표시)와 도구(저장) 둘 다 이 함수만 쓴다.
describe("computeContractDeposit", () => {
  it("총액을 비율대로 나누고 반올림한다", () => {
    expect(computeContractDeposit(1_980_000, 50)).toEqual({ depositAmount: 990_000, balanceAmount: 990_000 });
  });

  it("30%/70% 같은 비대칭 비율도 정확히 나눈다", () => {
    expect(computeContractDeposit(1_000_000, 30)).toEqual({ depositAmount: 300_000, balanceAmount: 700_000 });
  });

  it("반올림 때문에 생기는 오차는 잔금 쪽에서 흡수한다(합계는 항상 totalAmount와 일치)", () => {
    const result = computeContractDeposit(1_000_001, 33);
    expect(result.depositAmount + result.balanceAmount).toBe(1_000_001);
  });

  it("음수/0 방지 — 잔금은 0 미만으로 내려가지 않는다", () => {
    expect(computeContractDeposit(100, 150).balanceAmount).toBe(0);
  });
});
