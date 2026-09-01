import { create } from "zustand";
import { useOliviaLayoutStore } from "@/lib/store/useOliviaLayoutStore";

// Olivia Agent 2.0 — 채팅에서 연 "기능 화면"이 홈 페이지 레이아웃(split)이나 전체화면
// (fullscreen)으로 떠 있는 상태를 앱 전역에서 공유한다. OliviaWorkspaceShell(루트 레이아웃,
// 페이지 트리 바깥)도 이 store를 읽어서 전체화면일 때만 채팅 패널을 다시 보여준다 — 그래서
// React Context가 아니라 Zustand로 뒀다(페이지별 Provider 트리 밖에서도 읽어야 하므로).
//
// 타입 목록은 개편 요청서(16절 Workspace Registry)의 전체 목록을 그대로 두되, 실제로
// components/workspace/WorkspaceRegistry.ts에 컴포넌트가 등록된 건 quote/contract/conti
// 셋뿐이다 — 나머지(shoot-prep/calendar/project/gallery/files/photo-sort/analysis)는 이후
// 단계에서 화면이 생기면 그대로 등록만 추가하면 되도록 타입만 미리 열어둔 것.
export type WorkspaceType =
  | "quote"
  | "contract"
  | "conti"
  | "shoot-prep"
  | "calendar"
  | "project"
  | "gallery"
  | "files"
  | "photo-sort"
  | "analysis"
  | null;

export type WorkspaceMode = "home" | "split" | "fullscreen";

export type OpenWorkspaceContext = {
  clientId?: string;
  workflowRunId?: string;
  resourceId?: string;
  clientName?: string;
  projectName?: string;
  workspaceTitle?: string;
  source?: string;
  openedBy?: string;
  // preview_quote처럼 "패널을 열면서 바로 미리보기 화면으로 시작해라"는 의도 — 패널이 이미
  // 열려 있으면 각 빌더의 olivia-*-preview 이벤트 리스너가 처리하므로, 이 플래그는 "아직 안
  // 열려 있어서 새로 마운트되는" 경우에만 초기 상태로 쓰인다(2026-08-25, 미리보기 무반응 버그).
  startInPreview?: boolean;
};

export type WorkspaceState = {
  type: WorkspaceType;
  mode: WorkspaceMode;
  clientId?: string;
  workflowRunId?: string;
  resourceId?: string;
  clientName?: string;
  projectName?: string;
  workspaceTitle?: string;
  source?: string;
  openedBy?: string;
  startInPreview?: boolean;

  openWorkspace: (type: Exclude<WorkspaceType, null>, ctx?: OpenWorkspaceContext) => void;
  switchWorkspace: (type: Exclude<WorkspaceType, null>, ctx?: OpenWorkspaceContext) => void;
  closeWorkspace: () => void;
  enterFullscreen: () => void;
  exitFullscreen: () => void;
};

const EMPTY_CONTEXT = {
  clientId: undefined, workflowRunId: undefined, resourceId: undefined, clientName: undefined,
  projectName: undefined, workspaceTitle: undefined, source: undefined, openedBy: undefined,
  startInPreview: undefined,
};

export const useWorkspaceStore = create<WorkspaceState>((set, get) => ({
  type: null,
  mode: "home",
  ...EMPTY_CONTEXT,

  openWorkspace: (type, ctx = {}) => {
    set({ type, mode: "split", ...EMPTY_CONTEXT, ...ctx });
    useOliviaLayoutStore.getState().openWorkspaceMode();
  },

  // 같은 고객/프로젝트 컨텍스트를 유지한 채로 다른 워크스페이스로만 전환한다("콘티 보여줘") —
  // clientId/workflowRunId/clientName처럼 ctx에서 안 넘어온 필드는 기존 값을 그대로 이어간다.
  switchWorkspace: (type, ctx = {}) => {
    set((state) => ({
      type, mode: state.mode === "home" ? "split" : state.mode,
      clientId: ctx.clientId ?? state.clientId,
      workflowRunId: ctx.workflowRunId ?? state.workflowRunId,
      resourceId: ctx.resourceId,
      clientName: ctx.clientName ?? state.clientName,
      projectName: ctx.projectName ?? state.projectName,
      workspaceTitle: ctx.workspaceTitle,
      source: ctx.source ?? state.source,
      openedBy: ctx.openedBy ?? state.openedBy,
      startInPreview: ctx.startInPreview,
    }));
    useOliviaLayoutStore.getState().openWorkspaceMode();
  },

  closeWorkspace: () => {
    set({ type: null, mode: "home", ...EMPTY_CONTEXT });
    useOliviaLayoutStore.getState().closeWorkspaceMode();
  },

  enterFullscreen: () => {
    if (!get().type) return;
    set({ mode: "fullscreen" });
    useOliviaLayoutStore.getState().enterFullscreen();
  },
  exitFullscreen: () => {
    if (!get().type) return;
    set({ mode: "split" });
    useOliviaLayoutStore.getState().exitFullscreen();
  },
}));
