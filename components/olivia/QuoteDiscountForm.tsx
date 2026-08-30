"use client";

import { useState } from "react";
import { useQuoteWizardChatStore } from "@/lib/store/useQuoteWizardChatStore";
import { useQuoteStore } from "@/lib/store/useQuoteStore";
import { packages, singleItems } from "@/lib/quote/quoteCatalog";
import { computeQuoteTotals } from "@/lib/quote/computeQuoteTotals";
import { callOliviaTool } from "@/lib/olivia/inline-tools/callTool";

function formatWon(amount: number) {
  return `${amount.toLocaleString("ko-KR")}원`;
}

// 견적서 마법사 STEP 4 — 스펙 §13-15: [없음][5%][10%][직접입력] 퀵셀렉. QuotePreviewChatCard와
// 동일하게 useQuoteStore를 직접 구독해 computeQuoteTotals()로 라이브 미리보기를 계산한다(금액은
// 절대 LLM이 계산하지 않는다). 할인 적용 후에는 곧장 request_quote_publish를 실행해 최종 승인
// REQUEST_APPROVAL 카드로 이어간다(스펙 §19) — callOliviaTool이 반환하는 uiActions을 내부에서
// 이미 executeOliviaAction으로 처리하므로 승인 카드는 자동으로 채팅에 나타난다.
export default function QuoteDiscountForm({ flowId }: { flowId: string }) {
  const flow = useQuoteWizardChatStore((state) => state.flows[flowId]);
  const [customOpen, setCustomOpen] = useState(false);
  const [customPercent, setCustomPercent] = useState("");
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
  const extraDiscount = useQuoteStore((state) => state.extraDiscount);

  if (!flow || !flow.quoteId) return null;

  const selectedPackage = packages.find((item) => item.id === selectedPackageId) ?? null;
  const packageTotal = selectedPackage?.price ?? 0;
  const singleItemsTotal = (selectedSingleItemIds ?? []).reduce((sum, id) => {
    const item = singleItems.find((candidate) => candidate.id === id);
    if (!item) return sum;
    return sum + (brand === "jakeimage" ? (singleItemAmounts ?? {})[id] || 0 : item.price);
  }, 0);
  const optionsTotal =
    (profileCount ?? 0) * 250000 +
    (stagedCount ?? 0) * 450000 +
    (combinedProfileStagedCount ?? 0) * 650000 +
    (floorCount ?? 0) * 250000 +
    (largeHospital ? 750000 : 0) +
    (droneCount ?? 0) * 500000;

  const previewTotal = (rate: number) => computeQuoteTotals({
    packageTotal,
    singleItemsTotal,
    optionsTotal,
    customItems: customItems ?? [],
    discountRate: rate,
    extraDiscount: extraDiscount ?? 0,
  }).finalAmount;

  const apply = async (percent: number | null, remove: boolean) => {
    setApplying(true);
    setError(null);
    try {
      await callOliviaTool("apply_quote_discount", { amount: null, percent, remove });
      // 최종 승인(publish_quote)은 발행 API 자체가 고객을 자동 매칭/생성해버려서, 승인을
      // 요청하기 전에 먼저 고객 연결 상태를 확인해야 스펙 §23("Finalize 성공 직후 질문")이
      // 실제로 "묻고 나서 행동"하는 순서가 된다 — 이미 연결되어 있으면 곧장 승인으로 넘어간다.
      const { result } = await callOliviaTool("resolve_quote_client", { quoteId: flow.quoteId });
      if (result?.status === "already_linked") {
        await callOliviaTool("request_quote_publish", {});
        useQuoteWizardChatStore.getState().setStep(flowId, "complete");
      } else {
        useQuoteWizardChatStore.getState().setStep(flowId, "client_check");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "할인 적용에 실패했어요.");
    } finally {
      setApplying(false);
    }
  };

  const submitCustom = () => {
    const parsed = Number(customPercent);
    if (!Number.isFinite(parsed) || parsed < 0) return;
    void apply(parsed, parsed === 0);
  };

  return (
    <div className="olivia-select-match-card">
      <div className="olivia-select-match-card__section">
        <p>할인을 적용할까요?</p>
        <div className="olivia-select-match-card__actions">
          <button type="button" disabled={applying} onClick={() => void apply(null, true)}>할인 없음</button>
          <button type="button" disabled={applying} onClick={() => void apply(5, false)}>5% ({formatWon(previewTotal(5))})</button>
          <button type="button" disabled={applying} onClick={() => void apply(10, false)}>10% ({formatWon(previewTotal(10))})</button>
          <button type="button" disabled={applying} onClick={() => setCustomOpen(true)}>직접 입력</button>
        </div>
        {customOpen && (
          <div className="olivia-select-match-card__actions">
            <input
              type="number"
              min={0}
              max={100}
              value={customPercent}
              onChange={(event) => setCustomPercent(event.target.value)}
              placeholder="할인율(%)"
            />
            <button type="button" disabled={applying} onClick={submitCustom}>적용</button>
          </div>
        )}
        {error && <div className="olivia-select-match-card__error">{error}</div>}
      </div>
    </div>
  );
}
