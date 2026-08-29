"use client";

import { useQuoteStore } from "@/lib/store/useQuoteStore";
import { packages, singleItems } from "@/lib/quote/quoteCatalog";
import { computeQuoteTotals } from "@/lib/quote/computeQuoteTotals";
import { executeOliviaAction } from "@/lib/olivia/agent/actionRouter";

function formatWon(amount: number) {
  return `${amount.toLocaleString("ko-KR")}원`;
}

// 채팅 안 견적서 미리보기 카드 — useQuoteStore를 직접 구독하는 live 카드라서, 이후 채팅으로
// 항목/할인을 바꿔도 이 카드를 다시 만들 필요 없이 항상 최신 합계를 보여준다(단일 진실
// 공급원, QuoteBuilder.tsx와 정확히 같은 lib/quote/computeQuoteTotals.ts를 쓴다 — 합계를
// LLM이 다시 계산해서 말하지 않는다). flowId는 이 카드가 가리키는 견적의 resourceId다.
export default function QuotePreviewChatCard({ flowId }: { flowId: string }) {
  const customer = useQuoteStore((state) => state.customer);
  const quoteTitle = useQuoteStore((state) => state.quoteTitle);
  const brand = useQuoteStore((state) => state.brand);
  const selectedPackageId = useQuoteStore((state) => state.selectedPackageId);
  const selectedSingleItemIds = useQuoteStore((state) => state.selectedSingleItemIds);
  const singleItemAmounts = useQuoteStore((state) => state.singleItemAmounts);
  const profileCount = useQuoteStore((state) => state.profileCount);
  const stagedCount = useQuoteStore((state) => state.stagedCount);
  const combinedProfileStagedCount = useQuoteStore((state) => state.combinedProfileStagedCount);
  const floorCount = useQuoteStore((state) => state.floorCount);
  const largeHospital = useQuoteStore((state) => state.largeHospital);
  const droneCount = useQuoteStore((state) => state.droneCount);
  const customItems = useQuoteStore((state) => state.customItems);
  const discountRate = useQuoteStore((state) => state.discountRate);
  const extraDiscount = useQuoteStore((state) => state.extraDiscount);

  const selectedPackage = packages.find((item) => item.id === selectedPackageId) ?? null;
  const packageTotal = selectedPackage?.price ?? 0;
  const singleItemsTotal = selectedSingleItemIds.reduce((sum, id) => {
    const item = singleItems.find((candidate) => candidate.id === id);
    if (!item) return sum;
    return sum + (brand === "jakeimage" ? singleItemAmounts[id] || 0 : item.price);
  }, 0);
  const optionsTotal =
    profileCount * 250000 +
    stagedCount * 450000 +
    combinedProfileStagedCount * 650000 +
    floorCount * 250000 +
    (largeHospital ? 750000 : 0) +
    droneCount * 500000;

  const { finalAmount } = computeQuoteTotals({ packageTotal, singleItemsTotal, optionsTotal, customItems, discountRate, extraDiscount });

  return (
    <div className="olivia-quote-preview-card">
      <div className="olivia-quote-preview-card__label">견적서 Preview</div>
      <div className="olivia-quote-preview-card__client">{customer.hospitalName || "고객명 미입력"}</div>
      <div className="olivia-quote-preview-card__title">{quoteTitle || "제목 없음"}</div>
      <div className="olivia-quote-preview-card__total">{formatWon(finalAmount)}</div>
      <button
        type="button"
        onClick={() => executeOliviaAction({ type: "SWITCH_WORKSPACE", workspace: "quote", resourceId: flowId })}
      >
        크게 보기
      </button>
    </div>
  );
}
