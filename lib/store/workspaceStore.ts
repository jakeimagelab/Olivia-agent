import { create } from "zustand";

// Olivia Agent 2.0 Phase 2 — 채팅에서 연 "기능 화면"이 홈 페이지 레이아웃(split)이나 전체화면
// (fullscreen)으로 떠 있는 상태를 앱 전역에서 공유한다. GlobalOliviaChat(루트 레이아웃, 페이지
// 트리 바깥)도 이 store를 읽어서 전체화면일 때만 플로팅 챗 버튼을 다시 보여준다 — 그래서 React
// Context가 아니라 Zustand로 뒀다(페이지별 Provider 트리 밖에서도 읽어야 하므로).
//
// Phase 2 스코프: 우선 "quote" 워크스페이스 하나만 실제로 연결돼 있다(채팅에서 "OO 견적서
// 만들어줘" 했을 때). 다른 타입(contract/storyboard/...)은 이후 단계에서 하나씩 연결한다.
export type WorkspaceType = "quote" | "contract" | "conti" | null;
export type WorkspaceMode = "home" | "split" | "fullscreen";

export type WorkspaceState = {
  type: WorkspaceType;
  mode: WorkspaceMode;
  clientId?: string;
  workflowRunId?: string;
  resourceId?: string;
  clientName?: string;

  openWorkspace: (type: Exclude<WorkspaceType, null>, ctx: { clientId?: string; workflowRunId?: string; resourceId?: string; clientName?: string }) => void;
  closeWorkspace: () => void;
  enterFullscreen: () => void;
  exitFullscreen: () => void;
};

export const useWorkspaceStore = create<WorkspaceState>((set, get) => ({
  type: null,
  mode: "home",
  clientId: undefined,
  workflowRunId: undefined,
  resourceId: undefined,
  clientName: undefined,

  openWorkspace: (type, ctx) => set({
    type, mode: "split",
    clientId: ctx.clientId, workflowRunId: ctx.workflowRunId, resourceId: ctx.resourceId, clientName: ctx.clientName,
  }),

  closeWorkspace: () => set({ type: null, mode: "home", clientId: undefined, workflowRunId: undefined, resourceId: undefined, clientName: undefined }),

  enterFullscreen: () => { if (get().type) set({ mode: "fullscreen" }); },
  exitFullscreen: () => { if (get().type) set({ mode: "split" }); },
}));
