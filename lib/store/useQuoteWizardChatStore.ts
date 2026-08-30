"use client";

import { create } from "zustand";
import type { Brand } from "@/lib/quote/quoteFormTypes";

// 채팅 안에서 새 견적서를 만드는 마법사 카드(components/olivia/QuoteWizardChatCard.tsx)의
// 실시간 상태 — usePhotoClassificationChatStore.ts와 동일한 flowId-키 client-only 비영속
// 스토어 패턴. 여기에는 "지금 어느 단계를 보여줄지"를 위한 UI 라우팅 상태만 둔다 — 견적
// 데이터 자체(고객정보/패키지/할인 등)는 절대 중복 저장하지 않고 lib/store/useQuoteStore.ts가
// 유일한 소스로 남는다. brand는 create_quote가 실제로 실행되기 전까지의 임시 선택값일 뿐이고,
// 생성 후에는 useQuoteStore.brand가 진짜 값이다(견적서 UX 개편, 2026-08-31).
export type QuoteWizardStep = "brand" | "setup" | "discount" | "complete" | "error";

export type QuoteWizardFlowState = {
  flowId: string;
  step: QuoteWizardStep;
  brand: Brand | null;
  quoteId: string | null;
  errorMessage: string | null;
};

function emptyFlow(flowId: string, step: QuoteWizardStep = "brand"): QuoteWizardFlowState {
  return { flowId, step, brand: null, quoteId: null, errorMessage: null };
}

export type QuoteWizardChatStoreState = {
  flows: Record<string, QuoteWizardFlowState>;
  startFlow: (flowId: string) => void;
  setStep: (flowId: string, step: QuoteWizardStep) => void;
  setBrand: (flowId: string, brand: Brand) => void;
  setQuoteId: (flowId: string, quoteId: string) => void;
  setError: (flowId: string, message: string) => void;
  resetFlow: (flowId: string) => void;
};

function updateFlow(
  flows: Record<string, QuoteWizardFlowState>,
  flowId: string,
  patch: Partial<QuoteWizardFlowState>,
): Record<string, QuoteWizardFlowState> {
  const current = flows[flowId] ?? emptyFlow(flowId);
  return { ...flows, [flowId]: { ...current, ...patch } };
}

export const useQuoteWizardChatStore = create<QuoteWizardChatStoreState>((set) => ({
  flows: {},

  startFlow: (flowId) => set((state) => ({ flows: { ...state.flows, [flowId]: emptyFlow(flowId) } })),
  setStep: (flowId, step) => set((state) => ({ flows: updateFlow(state.flows, flowId, { step }) })),
  setBrand: (flowId, brand) => set((state) => ({ flows: updateFlow(state.flows, flowId, { brand }) })),
  setQuoteId: (flowId, quoteId) => set((state) => ({ flows: updateFlow(state.flows, flowId, { quoteId }) })),
  setError: (flowId, message) => set((state) => ({ flows: updateFlow(state.flows, flowId, { step: "error", errorMessage: message }) })),
  resetFlow: (flowId) => set((state) => ({ flows: { ...state.flows, [flowId]: emptyFlow(flowId) } })),
}));
