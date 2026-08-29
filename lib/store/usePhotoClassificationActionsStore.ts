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
};

type PhotoClassificationActionsState = {
  actions: PhotoClassificationActions | null;
  registerActions: (actions: PhotoClassificationActions | null) => void;
};

export const usePhotoClassificationActionsStore = create<PhotoClassificationActionsState>((set) => ({
  actions: null,
  registerActions: (actions) => set({ actions }),
}));
