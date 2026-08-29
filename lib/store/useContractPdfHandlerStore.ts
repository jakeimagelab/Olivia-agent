import { create } from "zustand";

// ContractBuilder.tsx는 QuoteBuilder.tsx와 달리 폼 상태를 Zustand로 안 두고 로컬 useState +
// "olivia-resource-refresh" 이벤트 재구독으로 실시간 반영을 처리한다(2026-08-30, PHASE 3 조사—
// 이미 새로고침 없이 잘 동작해서 폼 스토어를 새로 만들지 않기로 함). 다만 채팅에서 "PDF 줘"를
// 처리하려면 지금 마운트된 화면의 실제 downloadPdf() 콜백을 호출할 방법이 필요해서(useQuoteStore의
// pdfHandler/registerPdfHandler와 동일한 목적), 그 부분만 떼어 최소 스토어로 둔다 — 폼 필드나
// dirty 추적은 없다.
type ContractPdfHandlerState = {
  pdfHandler: (() => Promise<{ success: boolean; error?: string }>) | null;
  registerPdfHandler: (fn: (() => Promise<{ success: boolean; error?: string }>) | null) => void;
};

export const useContractPdfHandlerStore = create<ContractPdfHandlerState>((set) => ({
  pdfHandler: null,
  registerPdfHandler: (fn) => set({ pdfHandler: fn }),
}));
