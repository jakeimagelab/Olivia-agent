import { create } from "zustand";

// Olivia Agent 2.0 — 사용자가 자연어로 고객/프로젝트를 한 번 지정하면("히어산부인과 프로젝트
// 열어줘") 이후 요청("견적 만들어줘")에서 그 대상을 다시 말하지 않아도 되게 하는 "지금 무엇을
// 보고 있는지" 상태. workspaceStore(화면이 split/fullscreen인지, 어떤 워크스페이스가 열려
// 있는지)와는 별개 — 이쪽은 워크스페이스가 닫혀 있어도(홈 화면에서도) 유지되는 "대화 컨텍스트"다.
export type OliviaContextState = {
  activeClientId?: string;
  activeClientName?: string;
  activeProjectId?: string;
  activeProjectName?: string;
  activeWorkspace?: string;
  activeResourceId?: string;
  selectedEntityId?: string;
  selectedEntityType?: string;
  lastAction?: string;

  setClient: (id?: string, name?: string) => void;
  setProject: (id?: string, name?: string) => void;
  setWorkspace: (workspace?: string, resourceId?: string) => void;
  setResource: (resourceId?: string) => void;
  setSelectedEntity: (id?: string, type?: string) => void;
  clearContext: () => void;
};

export const useOliviaContextStore = create<OliviaContextState>((set) => ({
  activeClientId: undefined,
  activeClientName: undefined,
  activeProjectId: undefined,
  activeProjectName: undefined,
  activeWorkspace: undefined,
  activeResourceId: undefined,
  selectedEntityId: undefined,
  selectedEntityType: undefined,
  lastAction: undefined,

  setClient: (id, name) => set({ activeClientId: id, activeClientName: name, lastAction: "setClient" }),
  setProject: (id, name) => set({ activeProjectId: id, activeProjectName: name, lastAction: "setProject" }),
  setWorkspace: (workspace, resourceId) => set({ activeWorkspace: workspace, activeResourceId: resourceId, lastAction: "setWorkspace" }),
  setResource: (resourceId) => set({ activeResourceId: resourceId, lastAction: "setResource" }),
  setSelectedEntity: (id, type) => set({ selectedEntityId: id, selectedEntityType: type, lastAction: "setSelectedEntity" }),
  clearContext: () => set({
    activeClientId: undefined, activeClientName: undefined,
    activeProjectId: undefined, activeProjectName: undefined,
    activeWorkspace: undefined, activeResourceId: undefined,
    selectedEntityId: undefined, selectedEntityType: undefined,
    lastAction: "clearContext",
  }),
}));

// 채팅 API 호출마다 함께 보내는 pageContext 문자열 — Olivia가 "지금 뭘 보고 있는지" 알게 한다
// (요청서 20절). 값이 없는 필드는 줄 자체를 생략해서 프롬프트에 잡음을 안 넣는다.
export function buildOliviaPageContext(): string {
  const s = useOliviaContextStore.getState();
  const lines = [
    s.activeWorkspace ? `현재 화면: ${s.activeWorkspace}` : null,
    s.activeClientName ? `현재 고객: ${s.activeClientName}` : null,
    s.activeProjectName ? `현재 프로젝트: ${s.activeProjectName}` : null,
    s.activeResourceId ? `현재 resource: ${s.activeResourceId}` : null,
    s.selectedEntityId ? `현재 선택 항목: ${s.selectedEntityType ?? ""} ${s.selectedEntityId}`.trim() : null,
  ].filter((line): line is string => Boolean(line));
  return lines.length ? `[Olivia Context]\n${lines.join("\n")}` : "[현재 페이지: 홈]";
}
