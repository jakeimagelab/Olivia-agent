import { create } from "zustand";

// Olivia Agent 2.0 Phase 1 — 채팅 메시지/스트리밍 상태가 아니라 "채팅을 어느 DOM 노드에
// portal로 꽂을지"만 들고 있는 아주 작은 store. 두 번째 Chat store가 아니다.
//
// 홈 화면(OliviaAdaptiveStage, {children} 아래)과 OliviaWorkspaceShell(루트 레이아웃,
// {children}의 형제)은 React 트리에서 부모-자식 관계가 아니라서 ref를 그냥 prop으로
// 내려줄 수 없다 — workspaceStore.ts가 이미 같은 이유로 Context 대신 zustand를 쓴 것과
// 동일한 이유다. 홈은 이 store에 자기 슬롯 DOM 노드를 등록해두고, Shell은 그 노드가
// 생기면 단일 <OliviaConversation> 인스턴스를 그 안에 portal로 렌더링한다 — 그래서 홈 ↔
// 다른 워크스페이스 라우트를 오가도 채팅 컴포넌트가 재마운트되지 않는다.
type OliviaChatDockState = {
  node: HTMLElement | null;
  setNode: (node: HTMLElement | null) => void;
};

export const useOliviaChatDockStore = create<OliviaChatDockState>((set) => ({
  node: null,
  setNode: (node) => set({ node }),
}));
