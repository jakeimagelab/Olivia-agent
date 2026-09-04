import { create } from "zustand";
import { resolveSnapBounds, type SnapMode } from "@/components/olivia-os/window/snapZones";

// OLIVIA OS Phase 0/1/2 — Desktop Shell의 Window Manager 상태. 기존 lib/store/*.ts 컨벤션(순수
// zustand 싱글턴, 하위 폴더 없음)을 그대로 따른다. 기존 lib/store/workspaceStore.ts(Olivia Chat
// 70/30 스플릿용 "Workspace" 개념)와는 완전히 별개 시스템이다 — 이름도 일부러 겹치지 않게
// "Desktop"/"Window"만 쓴다.
export type { SnapMode };

export type OliviaWindowState = {
  id: string;
  appId: string;
  title: string;
  x: number;
  y: number;
  width: number;
  height: number;
  minimized: boolean;
  // Phase 1의 maximized:boolean을 snapMode로 통합했다 — maximize도 "전체 화면 프리셋"일 뿐
  // Snap Layout의 한 종류다(스펙 2-17). "none"이면 자유롭게 떠 있는 상태.
  snapMode: SnapMode;
  zIndex: number;
  previousBounds?: { x: number; y: number; width: number; height: number };
};

// Top Bar/Dock 높이 — AppWindow의 drag clamp와 snap/maximize 영역 계산이 공유한다(단일 소스).
export const DESKTOP_TOPBAR_HEIGHT = 40;
export const DESKTOP_DOCK_SAFE_AREA = 96;
// 화면 밖으로 창이 완전히 사라지지 않게 — 헤더 일부는 항상 viewport 안에 남긴다
// (useWindowInteractions.ts의 드래그 clamp와 동일한 값).
const MIN_VISIBLE_HEADER = 40;

const CASCADE_STEP = 24;
const CASCADE_START = 80;
const CASCADE_WRAP_AFTER = 6;
const Z_BASE = 100;
// 이 값을 넘으면 다음 bringToFront 호출 때 전체를 현재 순서대로 100번대로 재정규화한다 —
// "z-index 무한 증가 문제 방지"(스펙 1-11/2-28).
const Z_NORMALIZE_THRESHOLD = 10_000;

export type OpenAppInput = {
  appId: string;
  title: string;
  width: number;
  height: number;
};

type SnapBounds = { x: number; y: number; width: number; height: number };

type OliviaDesktopState = {
  windows: Record<string, OliviaWindowState>;
  activeWindowId: string | null;
  openCount: number;
  nextZIndex: number;
  // 드래그 중 "지금 놓으면 어디로 스냅될지" 힌트 — 영속화 대상 아님, SnapZoneOverlay가 구독.
  dragHint: Exclude<SnapMode, "none"> | null;
  // Show Desktop이 임시로 minimize한 창 id 목록 — 다시 누르면 정확히 이것만 복원한다(사용자가
  // 그 사이 개별적으로 최소화한 창까지 잘못 복원하지 않기 위해, 스펙 2-11).
  showDesktopStash: string[] | null;
  openApp: (input: OpenAppInput) => void;
  closeWindow: (id: string) => void;
  focusWindow: (id: string) => void;
  bringToFront: (id: string) => void;
  moveWindow: (id: string, x: number, y: number) => void;
  resizeWindow: (id: string, width: number, height: number) => void;
  minimizeWindow: (id: string) => void;
  restoreWindow: (id: string) => void;
  snapWindow: (id: string, mode: Exclude<SnapMode, "none">, bounds: SnapBounds) => void;
  unsnapWindow: (id: string) => void;
  setDragHint: (hint: Exclude<SnapMode, "none"> | null) => void;
  toggleShowDesktop: () => void;
  reconcileViewport: (viewportWidth: number, viewportHeight: number) => void;
};

export const useOliviaDesktopStore = create<OliviaDesktopState>((set, get) => ({
  windows: {},
  activeWindowId: null,
  openCount: 0,
  nextZIndex: Z_BASE,
  dragHint: null,
  showDesktopStash: null,

  // 앱당 창 하나(singleton) 모델 — 창 id는 appId를 그대로 쓴다. 이미 열려 있으면 새로 만들지
  // 않고 focus/restore만 한다(Dock/Shortcut 클릭 시 "열림→focus, minimized→restore" 동작,
  // 스펙 1-5/1-27).
  openApp: (input) => {
    const existing = get().windows[input.appId];
    if (existing) {
      if (existing.minimized) get().restoreWindow(existing.id);
      else get().focusWindow(existing.id);
      return;
    }
    const { openCount } = get();
    const slot = openCount % CASCADE_WRAP_AFTER;
    const x = CASCADE_START + slot * CASCADE_STEP;
    const y = CASCADE_START + slot * CASCADE_STEP;
    const zIndex = get().nextZIndex + 1;
    const win: OliviaWindowState = {
      id: input.appId, appId: input.appId, title: input.title,
      x, y, width: input.width, height: input.height,
      minimized: false, snapMode: "none", zIndex,
    };
    set((state) => ({
      windows: { ...state.windows, [win.id]: win },
      activeWindowId: win.id,
      openCount: state.openCount + 1,
      nextZIndex: zIndex,
    }));
  },

  closeWindow: (id) => set((state) => {
    const { [id]: _removed, ...rest } = state.windows;
    return { windows: rest, activeWindowId: state.activeWindowId === id ? null : state.activeWindowId };
  }),

  bringToFront: (id) => set((state) => {
    if (!state.windows[id]) return state;
    let windows = state.windows;
    let nextZIndex = state.nextZIndex;
    if (nextZIndex > Z_NORMALIZE_THRESHOLD) {
      const ordered = Object.values(windows).sort((a, b) => a.zIndex - b.zIndex);
      const normalized = { ...windows };
      ordered.forEach((win, index) => { normalized[win.id] = { ...win, zIndex: Z_BASE + index }; });
      windows = normalized;
      nextZIndex = Z_BASE + ordered.length;
    }
    const zIndex = nextZIndex + 1;
    return { windows: { ...windows, [id]: { ...windows[id], zIndex } }, nextZIndex: zIndex };
  }),

  focusWindow: (id) => {
    get().bringToFront(id);
    set({ activeWindowId: id });
  },

  moveWindow: (id, x, y) => set((state) => {
    const win = state.windows[id];
    if (!win) return state;
    return { windows: { ...state.windows, [id]: { ...win, x, y } } };
  }),

  resizeWindow: (id, width, height) => set((state) => {
    const win = state.windows[id];
    if (!win) return state;
    return { windows: { ...state.windows, [id]: { ...win, width, height } } };
  }),

  minimizeWindow: (id) => set((state) => {
    const win = state.windows[id];
    if (!win) return state;
    return {
      windows: { ...state.windows, [id]: { ...win, minimized: true } },
      activeWindowId: state.activeWindowId === id ? null : state.activeWindowId,
    };
  }),

  restoreWindow: (id) => {
    set((state) => {
      const win = state.windows[id];
      if (!win) return state;
      return { windows: { ...state.windows, [id]: { ...win, minimized: false } } };
    });
    get().focusWindow(id);
  },

  // maximize를 포함한 모든 Snap 프리셋의 공통 진입점(스펙 2-3~2-5, 2-17). 처음 스냅될 때만
  // 원래 floating 위치를 previousBounds에 저장한다 — 이미 스냅된 창을 다른 프리셋으로 바꿔도
  // "원래" 자유 위치를 잃지 않는다(스펙 2-18과 함께 동작).
  snapWindow: (id, mode, bounds) => set((state) => {
    const win = state.windows[id];
    if (!win) return state;
    const previousBounds = win.snapMode === "none"
      ? { x: win.x, y: win.y, width: win.width, height: win.height }
      : win.previousBounds;
    return { windows: { ...state.windows, [id]: { ...win, ...bounds, snapMode: mode, previousBounds } } };
  }),

  unsnapWindow: (id) => set((state) => {
    const win = state.windows[id];
    if (!win || win.snapMode === "none" || !win.previousBounds) return state;
    return { windows: { ...state.windows, [id]: { ...win, ...win.previousBounds, snapMode: "none", previousBounds: undefined } } };
  }),

  setDragHint: (hint) => set({ dragHint: hint }),

  // Dock 첫 버튼(Home/Desktop) — 토글. 처음 누르면 지금 떠 있는 창들만 minimize하고 그 id를
  // stash, 다시 누르면 정확히 그 창들만 복원한다("창 전체 닫기"와 혼동 금지, 스펙 2-11).
  toggleShowDesktop: () => set((state) => {
    if (state.showDesktopStash) {
      const windows = { ...state.windows };
      for (const id of state.showDesktopStash) {
        if (windows[id]) windows[id] = { ...windows[id], minimized: false };
      }
      return { windows, showDesktopStash: null };
    }
    const idsToHide = Object.values(state.windows).filter((win) => !win.minimized).map((win) => win.id);
    if (idsToHide.length === 0) return state;
    const windows = { ...state.windows };
    for (const id of idsToHide) windows[id] = { ...windows[id], minimized: true };
    return { windows, showDesktopStash: idsToHide, activeWindowId: null };
  }),

  // 브라우저 창 크기가 바뀌어도(외부 모니터 해제, 맥북 화면 복귀 등) 창이 화면 밖으로 나가지
  // 않게 한다(스펙 2-15/2-16). snap/maximize된 창은 저장된 픽셀을 못 믿고 새 뷰포트 기준으로
  // 다시 계산하고, 떠 있는 창은 위치/크기만 clamp한다.
  reconcileViewport: (viewportWidth, viewportHeight) => set((state) => {
    let changed = false;
    const windows = { ...state.windows };
    for (const [id, win] of Object.entries(windows)) {
      if (win.snapMode !== "none") {
        const bounds = resolveSnapBounds(win.snapMode, viewportWidth, viewportHeight, DESKTOP_TOPBAR_HEIGHT, DESKTOP_DOCK_SAFE_AREA);
        windows[id] = { ...win, ...bounds };
        changed = true;
        continue;
      }
      const clampedX = Math.max(-(win.width - MIN_VISIBLE_HEADER), Math.min(viewportWidth - MIN_VISIBLE_HEADER, win.x));
      const clampedY = Math.max(DESKTOP_TOPBAR_HEIGHT, Math.min(viewportHeight - MIN_VISIBLE_HEADER, win.y));
      const clampedWidth = Math.min(win.width, Math.max(320, viewportWidth - 24));
      const clampedHeight = Math.min(win.height, Math.max(240, viewportHeight - DESKTOP_TOPBAR_HEIGHT - 24));
      if (clampedX !== win.x || clampedY !== win.y || clampedWidth !== win.width || clampedHeight !== win.height) {
        windows[id] = { ...win, x: clampedX, y: clampedY, width: clampedWidth, height: clampedHeight };
        changed = true;
      }
    }
    return changed ? { windows } : state;
  }),
}));

// ── Window Persistence (스펙 2-6~2-8, 2-37) ───────────────────────────────────────────────
// 이 repo의 다른 store는 zustand persist 미들웨어를 안 쓰므로(기존 관례) 여기서도 새 패턴을
// 들이지 않고 수동 localStorage read/write로 구현한다. FileSystemHandle/File/Blob/DOM
// 참조/ReactNode/함수는 OliviaWindowState 자체에 애초에 없으므로(각 앱의 내부 상태일 뿐) 직렬화
// 위험이 구조적으로 없다.
export const DESKTOP_STATE_VERSION = 1;
const STORAGE_KEY = "olivia-os-desktop-state";
// "12개 창이 열려 있었다고 전부 복원하면 실패"(스펙 2-8) — 최근 포커스 순 상위 4개까지만,
// minimized였던 창은 애초에 저장하지 않는다.
const MAX_RESTORED_WINDOWS = 4;

type PersistedWindow = {
  appId: string; title: string; x: number; y: number; width: number; height: number;
  snapMode: SnapMode; previousBounds?: SnapBounds;
};
type PersistedState = { version: number; windows: PersistedWindow[]; activeAppId: string | null };

function isPersistedWindow(value: unknown): value is PersistedWindow {
  if (!value || typeof value !== "object") return false;
  const w = value as Record<string, unknown>;
  return typeof w.appId === "string" && typeof w.title === "string"
    && typeof w.x === "number" && typeof w.y === "number"
    && typeof w.width === "number" && typeof w.height === "number";
}

export function saveDesktopState() {
  if (typeof window === "undefined") return;
  try {
    const { windows, activeWindowId } = useOliviaDesktopStore.getState();
    const visible = Object.values(windows).filter((win) => !win.minimized);
    const top = visible.sort((a, b) => b.zIndex - a.zIndex).slice(0, MAX_RESTORED_WINDOWS);
    const payload: PersistedState = {
      version: DESKTOP_STATE_VERSION,
      windows: top.map((win) => ({
        appId: win.appId, title: win.title, x: win.x, y: win.y, width: win.width, height: win.height,
        snapMode: win.snapMode, previousBounds: win.previousBounds,
      })),
      activeAppId: activeWindowId,
    };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // localStorage 사용 불가(사파리 프라이빗 모드 등)해도 Desktop 자체는 계속 동작해야 한다.
  }
}

// knownAppIds는 호출부(OliviaDesktop.tsx)가 oliviaAppRegistry에서 뽑아 넘긴다 — 이 store
// 파일이 components/의 Registry(그리고 그 안의 무거운 앱 컴포넌트들)를 직접 import하지
// 않기 위해서다.
export function loadDesktopState(knownAppIds: Set<string>) {
  if (typeof window === "undefined") return;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as Partial<PersistedState>;
    // 버전이 다르거나 형태가 깨져 있으면 통째로 버리고 빈 Desktop으로 시작한다(스펙 2-37) —
    // Desktop 전체가 깨지는 것보다 낫다.
    if (parsed.version !== DESKTOP_STATE_VERSION || !Array.isArray(parsed.windows)) return;
    const valid = parsed.windows.filter((win) => isPersistedWindow(win) && knownAppIds.has(win.appId));
    if (valid.length === 0) return;

    let zIndex = Z_BASE;
    const windows: Record<string, OliviaWindowState> = {};
    for (const win of valid) {
      zIndex += 1;
      windows[win.appId] = {
        id: win.appId, appId: win.appId, title: win.title,
        x: win.x, y: win.y, width: win.width, height: win.height,
        minimized: false, snapMode: win.snapMode ?? "none", previousBounds: win.previousBounds,
        zIndex,
      };
    }
    const activeAppId = typeof parsed.activeAppId === "string" && windows[parsed.activeAppId] ? parsed.activeAppId : null;
    useOliviaDesktopStore.setState({
      windows, activeWindowId: activeAppId, nextZIndex: zIndex, openCount: valid.length,
    });
  } catch {
    // 파싱 실패 등 오염된 state는 조용히 버린다(스펙 2-37).
  }
}

// windows/activeWindowId가 바뀔 때마다(드래그 중 매 픽셀 이동 포함) 곧바로 저장하면 너무
// 잦으므로 짧게 debounce한다. 이 구독은 store 생성과 동시에 한 번만 등록된다 — 어떤 컴포넌트를
// 쓰든 영속화가 자동으로 따라온다.
if (typeof window !== "undefined") {
  let saveTimer: ReturnType<typeof setTimeout> | null = null;
  useOliviaDesktopStore.subscribe((state, prevState) => {
    if (state.windows === prevState.windows && state.activeWindowId === prevState.activeWindowId) return;
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(saveDesktopState, 300);
  });
}
