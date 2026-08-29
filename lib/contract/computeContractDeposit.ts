// 계약금 비율이 바뀌어도 LLM이 암산하지 않는다 — ContractBuilder.tsx(표시)와
// update_contract_terms 도구(저장) 둘 다 이 함수 하나만 쓴다. 견적 총액(totalAmount)은
// 이 함수가 바꾸지 않는다 — 계약금/잔금만 재분배한다.
export function computeContractDeposit(totalAmount: number, depositRate: number) {
  const depositAmount = Math.round((totalAmount || 0) * (depositRate || 0) / 100);
  return { depositAmount, balanceAmount: Math.max((totalAmount || 0) - depositAmount, 0) };
}
