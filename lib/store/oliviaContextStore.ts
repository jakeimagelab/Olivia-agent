import { create } from "zustand";

export type OliviaRecentAction = {
  type: string;
  at: string;
  entityId?: string;
  before?: unknown;
  after?: unknown;
};

export type OliviaContextState = {
  activeClientId?: string;
  activeClientName?: string;
  activeProjectId?: string;
  activeProjectName?: string;
  activeWorkspace?: string;
  activeResourceId?: string;
  selectedEntityId?: string;
  selectedEntityType?: string;
  selectedScheduleId?: string;
  recentActions: OliviaRecentAction[];
  revision: number;
  lastAction?: string;

  setClient: (id?: string, name?: string) => void;
  setProject: (id?: string, name?: string) => void;
  setWorkspace: (workspace?: string, resourceId?: string) => void;
  setResource: (resourceId?: string) => void;
  setSelection: (type?: string, id?: string) => void;
  setSelectedEntity: (id?: string, type?: string) => void;
  setSelectedSchedule: (id?: string) => void;
  pushRecentAction: (action: OliviaRecentAction | string) => void;
  recordAction: (action: string) => void;
  clearSelection: () => void;
  clearContext: () => void;
};

function normalizeAction(action: OliviaRecentAction | string): OliviaRecentAction {
  return typeof action === "string"
    ? { type: action, at: new Date().toISOString() }
    : { ...action, at: action.at || new Date().toISOString() };
}

export const useOliviaContextStore = create<OliviaContextState>((set) => ({
  recentActions: [],
  revision: 0,

  setClient: (id, name) => set((state) => ({
    activeClientId: id,
    activeClientName: name,
    lastAction: "setClient",
    revision: state.revision + 1,
  })),
  setProject: (id, name) => set((state) => ({
    activeProjectId: id,
    activeProjectName: name,
    lastAction: "setProject",
    revision: state.revision + 1,
  })),
  setWorkspace: (workspace, resourceId) => set((state) => ({
    activeWorkspace: workspace,
    activeResourceId: resourceId,
    selectedEntityId: workspace === state.activeWorkspace ? state.selectedEntityId : undefined,
    selectedEntityType: workspace === state.activeWorkspace ? state.selectedEntityType : undefined,
    lastAction: "setWorkspace",
    revision: state.revision + 1,
  })),
  setResource: (resourceId) => set((state) => ({
    activeResourceId: resourceId,
    lastAction: "setResource",
    revision: state.revision + 1,
  })),
  setSelection: (type, id) => set((state) => ({
    selectedEntityType: type,
    selectedEntityId: id,
    lastAction: "setSelection",
    revision: state.revision + 1,
  })),
  setSelectedEntity: (id, type) => set((state) => ({
    selectedEntityType: type,
    selectedEntityId: id,
    lastAction: "setSelection",
    revision: state.revision + 1,
  })),
  setSelectedSchedule: (id) => set((state) => ({
    selectedScheduleId: id,
    selectedEntityType: id ? "schedule" : state.selectedEntityType,
    selectedEntityId: id || state.selectedEntityId,
    lastAction: "setSelectedSchedule",
    revision: state.revision + 1,
  })),
  pushRecentAction: (action) => set((state) => {
    const normalized = normalizeAction(action);
    return {
      recentActions: [...state.recentActions, normalized].slice(-8),
      lastAction: normalized.type,
      revision: state.revision + 1,
    };
  }),
  recordAction: (action) => set((state) => ({
    recentActions: [...state.recentActions, normalizeAction(action)].slice(-8),
    lastAction: action,
    revision: state.revision + 1,
  })),
  clearSelection: () => set((state) => ({
    selectedEntityId: undefined,
    selectedEntityType: undefined,
    selectedScheduleId: undefined,
    lastAction: "clearSelection",
    revision: state.revision + 1,
  })),
  clearContext: () => set((state) => ({
    activeClientId: undefined,
    activeClientName: undefined,
    activeProjectId: undefined,
    activeProjectName: undefined,
    activeWorkspace: undefined,
    activeResourceId: undefined,
    selectedEntityId: undefined,
    selectedEntityType: undefined,
    selectedScheduleId: undefined,
    recentActions: [],
    revision: state.revision + 1,
    lastAction: "clearContext",
  })),
}));

export function getOliviaContextSnapshot(pathname?: string) {
  const state = useOliviaContextStore.getState();
  return {
    pathname,
    activeClientId: state.activeClientId,
    activeClientName: state.activeClientName,
    activeProjectId: state.activeProjectId,
    activeProjectName: state.activeProjectName,
    activeWorkspace: state.activeWorkspace,
    activeResourceId: state.activeResourceId,
    selectedEntityType: state.selectedEntityType,
    selectedEntityId: state.selectedEntityId,
    selectedScheduleId: state.selectedScheduleId,
    recentActions: state.recentActions,
    revision: state.revision,
  };
}

export function buildOliviaPageContext(pathname?: string): string {
  const context = getOliviaContextSnapshot(pathname);
  const pageContext = {
    page: context.pathname || "home",
    client: context.activeClientId || context.activeClientName
      ? { id: context.activeClientId, name: context.activeClientName }
      : undefined,
    project: context.activeProjectId || context.activeProjectName
      ? { id: context.activeProjectId, name: context.activeProjectName }
      : undefined,
    workspace: context.activeWorkspace
      ? { type: context.activeWorkspace, resourceId: context.activeResourceId }
      : undefined,
    selection: context.selectedEntityType || context.selectedEntityId
      ? { type: context.selectedEntityType, id: context.selectedEntityId }
      : undefined,
    scheduleId: context.selectedScheduleId,
    recentActions: context.recentActions.slice(-4).map((action) => action.type),
  };
  return JSON.stringify(pageContext);
}
