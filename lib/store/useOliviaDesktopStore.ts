import { create } from "zustand";

// OLIVIA OS Phase 0/1 — Desktop Shell의 Window Manager 상태. 기존 lib/store/*.ts 컨벤션(순수
// zustand 싱글턴, 하위 폴더 없음)을 그대로 따른다. 기존 lib/store/workspaceStore.ts(Olivia Chat
// 70/30 스플릿용 "Workspace" 개념)와는 완전히 별개 시스템이다 — 이름도 일부러 겹치지 않게
// "Desktop"/"Window"만 쓴다. persist는 Phase 1에서 적용하지 않는다(Phase 2에서 검토).
export type OliviaWindowState = {
  id: string;
  appId: string;
  title: string;
  x: number;
  y: number;
  width: number;
  height: number;
  minimized: boolean;
  maximized: boolean;
  zIndex: number;
  previousBounds?: { x: number; y: number; width: number; height: number };
};

// Top Bar/Dock 높이 — AppWindow의 drag clamp와 maximize 영역 계산이 공유한다(단일 소스).
export const DESKTOP_TOPBAR_HEIGHT = 40;
export const DESKTOP_DOCK_SAFE_AREA = 96;

const CASCADE_STEP = 24;
const CASCADE_START = 80;
const CASCADE_WRAP_AFTER = 6;
const Z_BASE = 100;
// 이 값을 넘으면 다음 bringToFront 호출 때 전체를 현재 순서대로 100번대로 재정규화한다 —
// "z-index 무한 증가 문제 방지"(스펙 1-11).
const Z_NORMALIZE_THRESHOLD = 10_000;

export type OpenAppInput = {
  appId: string;
  title: string;
  width: number;
  height: number;
};

export type MaximizeWorkArea = { left: number; top: number; right: number; bottom: number };

type OliviaDesktopState = {
  windows: Record<string, OliviaWindowState>;
  activeWindowId: string | null;
  openCount: number;
  nextZIndex: number;
  openApp: (input: OpenAppInput) => void;
  closeWindow: (id: string) => void;
  focusWindow: (id: string) => void;
  bringToFront: (id: string) => void;
  moveWindow: (id: string, x: number, y: number) => void;
  resizeWindow: (id: string, width: number, height: number) => void;
  minimizeWindow: (id: string) => void;
  restoreWindow: (id: string) => void;
  maximizeWindow: (id: string, workArea: MaximizeWorkArea) => void;
  restoreMaximizedWindow: (id: string) => void;
  minimizeAll: () => void;
};

export const useOliviaDesktopStore = create<OliviaDesktopState>((set, get) => ({
  windows: {},
  activeWindowId: null,
  openCount: 0,
  nextZIndex: Z_BASE,

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
      minimized: false, maximized: false, zIndex,
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

  maximizeWindow: (id, workArea) => set((state) => {
    const win = state.windows[id];
    if (!win || win.maximized) return state;
    return {
      windows: {
        ...state.windows,
        [id]: {
          ...win, maximized: true,
          previousBounds: { x: win.x, y: win.y, width: win.width, height: win.height },
          x: workArea.left, y: workArea.top,
          width: workArea.right - workArea.left, height: workArea.bottom - workArea.top,
        },
      },
    };
  }),

  restoreMaximizedWindow: (id) => set((state) => {
    const win = state.windows[id];
    if (!win || !win.maximized || !win.previousBounds) return state;
    return { windows: { ...state.windows, [id]: { ...win, ...win.previousBounds, maximized: false, previousBounds: undefined } } };
  }),

  // Dock 첫 버튼(Home/Desktop) — "열린 앱을 닫지 않는다, 전부 minimize"(스펙 1-27 Show Desktop).
  minimizeAll: () => set((state) => ({
    windows: Object.fromEntries(Object.entries(state.windows).map(([id, win]) => [id, { ...win, minimized: true }])),
    activeWindowId: null,
  })),
}));
