import { create } from "zustand";

export type OliviaRecentAction = {
  type: string;
  at: string;
  entityId?: string;
  before?: unknown;
  after?: unknown;
};

// 코드 요청서 — Olivia Chat Intelligence Core(2026-08-17). "히어" 같은 축약 별칭, "그거"/
// "아까 거" 같은 지시어를 풀려면 "최근 대화에서 뭘 다뤘는지"가 필요한데, 이 스토어는 원래
// "지금 화면에서 뭘 보고 있는지"만 담당했다 — 두 개를 별도 진실 공급원으로 쪼개면 어긋나기
// 쉬워서, 기존 클라이언트/프로젝트/리소스/선택 setter들이 호출되는 지점 그대로에 최근 언급
// 기록을 얹는다(신규 호출 지점을 늘리지 않음).
export type ConversationEntity = {
  type: string; // client | project | quote | contract | conti | conti-shot | schedule | gallery | file 등
  id: string;
  name?: string;
  lastMentionedAt: string;
};

export type EntityAlias = { type: string; id: string; name: string };

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
  recentEntities: ConversationEntity[];
  aliases: Record<string, EntityAlias>;
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
  rememberEntity: (entity: Omit<ConversationEntity, "lastMentionedAt">) => void;
  setAlias: (alias: string, ref: EntityAlias) => void;
  clearSelection: () => void;
  clearContext: () => void;
};

function normalizeAction(action: OliviaRecentAction | string): OliviaRecentAction {
  return typeof action === "string"
    ? { type: action, at: new Date().toISOString() }
    : { ...action, at: action.at || new Date().toISOString() };
}

function rememberEntityIn(recentEntities: ConversationEntity[], entity: Omit<ConversationEntity, "lastMentionedAt">): ConversationEntity[] {
  if (!entity.id) return recentEntities;
  const withoutDuplicate = recentEntities.filter((e) => !(e.type === entity.type && e.id === entity.id));
  return [...withoutDuplicate, { ...entity, lastMentionedAt: new Date().toISOString() }].slice(-10);
}

// "히어산부인과" → "히어" 처럼 흔한 병원명 접미사를 떼어 짧은 별칭 후보를 만든다. 2글자
// 미만이면(접미사를 떼도 너무 짧으면) 별칭을 만들지 않는다 — 오히려 다른 이름과 헷갈릴 위험.
const HOSPITAL_NAME_SUFFIXES = [
  "한방병원", "성형외과", "정형외과", "피부과", "산부인과", "비뇨기과", "안과", "치과",
  "한의원", "의원", "병원", "클리닉",
];

export function deriveAlias(fullName: string): string | null {
  const trimmed = fullName.trim();
  for (const suffix of HOSPITAL_NAME_SUFFIXES) {
    if (trimmed.endsWith(suffix) && trimmed.length > suffix.length) {
      const alias = trimmed.slice(0, -suffix.length).trim();
      if (alias.length >= 2) return alias;
    }
  }
  return null;
}

export const useOliviaContextStore = create<OliviaContextState>((set) => ({
  recentActions: [],
  recentEntities: [],
  aliases: {},
  revision: 0,

  setClient: (id, name) => set((state) => {
    const alias = name ? deriveAlias(name) : null;
    return {
      activeClientId: id,
      activeClientName: name,
      lastAction: "setClient",
      revision: state.revision + 1,
      recentEntities: id ? rememberEntityIn(state.recentEntities, { type: "client", id, name }) : state.recentEntities,
      aliases: alias && id && name ? { ...state.aliases, [alias]: { type: "client", id, name } } : state.aliases,
    };
  }),
  setProject: (id, name) => set((state) => ({
    activeProjectId: id,
    activeProjectName: name,
    lastAction: "setProject",
    revision: state.revision + 1,
    recentEntities: id ? rememberEntityIn(state.recentEntities, { type: "project", id, name }) : state.recentEntities,
  })),
  setWorkspace: (workspace, resourceId) => set((state) => ({
    activeWorkspace: workspace,
    activeResourceId: resourceId,
    selectedEntityId: workspace === state.activeWorkspace ? state.selectedEntityId : undefined,
    selectedEntityType: workspace === state.activeWorkspace ? state.selectedEntityType : undefined,
    lastAction: "setWorkspace",
    revision: state.revision + 1,
    recentEntities: workspace && resourceId
      ? rememberEntityIn(state.recentEntities, { type: workspace, id: resourceId })
      : state.recentEntities,
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
    recentEntities: type && id ? rememberEntityIn(state.recentEntities, { type, id }) : state.recentEntities,
  })),
  setSelectedEntity: (id, type) => set((state) => ({
    selectedEntityType: type,
    selectedEntityId: id,
    lastAction: "setSelection",
    revision: state.revision + 1,
    recentEntities: type && id ? rememberEntityIn(state.recentEntities, { type, id }) : state.recentEntities,
  })),
  setSelectedSchedule: (id) => set((state) => ({
    selectedScheduleId: id,
    selectedEntityType: id ? "schedule" : state.selectedEntityType,
    selectedEntityId: id || state.selectedEntityId,
    lastAction: "setSelectedSchedule",
    revision: state.revision + 1,
    recentEntities: id ? rememberEntityIn(state.recentEntities, { type: "schedule", id }) : state.recentEntities,
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
  rememberEntity: (entity) => set((state) => ({
    recentEntities: rememberEntityIn(state.recentEntities, entity),
    revision: state.revision + 1,
  })),
  // 사용자가 "앞으로 이 병원은 히어라고 부를게"처럼 명시적으로 별칭을 지정할 때 쓴다(세션
  // 스코프 — 6절 지시대로 영구 저장은 이번 phase에 안 함, 새로고침/새 대화 시작 시 초기화).
  setAlias: (alias, ref) => set((state) => ({
    aliases: { ...state.aliases, [alias]: ref },
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
