"use client";

import { useQuoteWizardChatStore } from "@/lib/store/useQuoteWizardChatStore";
import QuoteBrandSelector from "./QuoteBrandSelector";
import QuoteSetupForm from "./QuoteSetupForm";
import QuoteDiscountForm from "./QuoteDiscountForm";

// 견적서 마법사 라우터 카드 — Inline Tool 프레임워크 계약({flowId}만 받는다) 그대로 하나의
// 등록(quote_wizard)만 쓰고, 내부적으로 step에 따라 브랜드 선택→설정 폼→할인 퀵셀렉을
// 순서대로 보여준다. 매 단계 전환마다 GPT를 다시 거치지 않는다(견적서 UX 개편, 2026-08-31,
// 스펙 §38-39 — 카드 스스로 다음 단계를 열고, 이미 정보가 충분하면 GPT가 이 카드를 아예
// 건너뛰고 create_quote를 바로 부를 수도 있다). "complete"/"error"에서는 카드가 할 일이
// 끝났으므로(승인 카드나 다음 안내는 채팅 자체에 이미 떠 있다) 조용히 사라진다.
export default function QuoteWizardChatCard({ flowId }: { flowId: string }) {
  const flow = useQuoteWizardChatStore((state) => state.flows[flowId]);
  if (!flow) return null;

  if (flow.step === "brand") return <QuoteBrandSelector flowId={flowId} />;
  if (flow.step === "setup") return <QuoteSetupForm flowId={flowId} />;
  if (flow.step === "discount") return <QuoteDiscountForm flowId={flowId} />;
  if (flow.step === "error") {
    return (
      <div className="olivia-select-match-card">
        <div className="olivia-select-match-card__section">
          <div className="olivia-select-match-card__error">{flow.errorMessage || "오류가 발생했어요."}</div>
        </div>
      </div>
    );
  }
  return null;
}
