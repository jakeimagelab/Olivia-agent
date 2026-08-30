"use client";

import { useQuoteWizardChatStore } from "@/lib/store/useQuoteWizardChatStore";
import { BRAND_CONFIG } from "@/lib/quote/quoteCatalog";
import type { Brand } from "@/lib/quote/quoteFormTypes";

const BRAND_ORDER: Brand[] = ["photoclinic", "jakeimage"];

// 견적서 마법사의 첫 단계 — 스펙 §2: "어떤 견적서를 작성할까요?" + 브랜드 버튼 2개. 브랜드
// 선택은 아직 DB 쓰기가 아니므로(create_quote가 실제로 실행되기 전) 클릭 시 로컬 상태만
// 바꾸고 곧장 setup 단계로 전환한다 — GPT 왕복 없이 카드 스스로 다음 단계를 연다.
export default function QuoteBrandSelector({ flowId }: { flowId: string }) {
  const flow = useQuoteWizardChatStore((state) => state.flows[flowId]);
  if (!flow) return null;

  const choose = (brand: Brand) => {
    useQuoteWizardChatStore.getState().setBrand(flowId, brand);
    useQuoteWizardChatStore.getState().setStep(flowId, "setup");
  };

  return (
    <div className="olivia-select-match-card">
      <div className="olivia-select-match-card__section">
        <p>어떤 견적서를 작성할까요?</p>
        <div className="olivia-select-match-card__actions">
          {BRAND_ORDER.map((brand) => (
            <button key={brand} type="button" onClick={() => choose(brand)}>
              {BRAND_CONFIG[brand].label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
