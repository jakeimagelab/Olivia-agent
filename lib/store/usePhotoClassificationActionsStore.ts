import { create } from "zustand";

// PhotoSortingWorkspace.tsx의 renameFieldScene/mergeFieldScenes/splitFieldScene는 컴포넌트
// 로컬 state(fieldScenes 등)에 묶인 함수라 서버/다른 컴포넌트에서 직접 부를 수 없다.
// useContractPdfHandlerStore.ts와 동일한 목적의 최소 콜백 등록 스토어로 연결한다(PHASE 4,
// 2026-08-30) — 지금 마운트된 Workspace 인스턴스가 있을 때만 값이 채워지고, 없으면 null이라
// "지금 열려 있는 사진 분류 화면이 없다"는 신호로 쓸 수 있다.
type PhotoClassificationActions = {
  renameScene: (sceneIndex: number, newName: string) => boolean;
  mergeScenes: (sceneIndexA: number, sceneIndexB: number) => void;
  splitScene: (sceneIndex: number, offset: number) => void;
  // AI 사진 분류 2.0(스펙 §35/36) — 위 셋과 달리 비동기(네트워크 호출 포함)라 완료 후 실제
  // 결과를 돌려준다. 호출 쪽(useOliviaConversationStore.ts)이 이 결과를 보고 채팅 응답 문구를
  // 정하므로, 여기서 낙관적으로 성공을 가정하지 않는다.
  startAiClassification: () => Promise<{ ok: boolean; reason?: string; sceneCount?: number }>;
  submitNlRequest: (message: string) => Promise<{ ok: boolean; sceneCount?: number }>;
};

type PhotoClassificationActionsState = {
  actions: PhotoClassificationActions | null;
  registerActions: (actions: PhotoClassificationActions | null) => void;
};

export const usePhotoClassificationActionsStore = create<PhotoClassificationActionsState>((set) => ({
  actions: null,
  registerActions: (actions) => set({ actions }),
}));
