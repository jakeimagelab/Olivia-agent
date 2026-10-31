"use client";

import { useCallback, useEffect, useRef } from "react";
import { oliviaAppRegistry } from "./registry/oliviaAppRegistry";
import { useOliviaDesktopStore } from "@/lib/store/useOliviaDesktopStore";
import { AppWindow } from "./window/AppWindow";
import { getDesktopContentKey } from "@/lib/olivia/desktopContentKey";
import { TodayWindowContent } from "./adapters/TodayWindowContent";
import { DesktopCaseChrome } from "./DesktopCaseChrome";
import styles from "./OliviaDesktop.module.css";

export function DesktopSurface({ onDesktopContextMenu }: { onDesktopContextMenu?: (x: number, y: number) => void }) {
  const windows = useOliviaDesktopStore((state) => state.windows);
  const activeWindowId = useOliviaDesktopStore((state) => state.activeWindowId);
  const showDesktopStash = useOliviaDesktopStore((state) => state.showDesktopStash);
  const focusWindow = useOliviaDesktopStore((state) => state.focusWindow);
  const restoreWindow = useOliviaDesktopStore((state) => state.restoreWindow);
  const setWorkspaceSize = useOliviaDesktopStore((state) => state.setWorkspaceSize);
  const toggleShowDesktop = useOliviaDesktopStore((state) => state.toggleShowDesktop);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const visitHistoryRef = useRef<string[]>([]);
  const visitIndexRef = useRef(-1);
  const lastActiveWindowIdRef = useRef<string | null>(null);
  const pendingHistoryTargetRef = useRef<string | null>(null);

  // WindowLayer 자체를 측정해 모든 창 좌표를 viewport가 아닌 DesktopSurface 기준으로 통일한다.
  useEffect(() => {
    const surface = surfaceRef.current;
    if (!surface) return;
    const measure = () => setWorkspaceSize(surface.clientWidth, surface.clientHeight);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(surface);
    return () => observer.disconnect();
  }, [setWorkspaceSize]);

  // 기존 windows 컬렉션은 닫기 전까지 방문한 앱을 보존한다. 렌더는 활성 앱 하나만 하고,
  // 이 순서만 별도로 기억해 브라우저처럼 뒤로/앞으로 이동한다. 스토어의 외부 API와
  // 앱별 openApp 호출부는 그대로 둔다.
  useEffect(() => {
    const availableIds = new Set(Object.keys(windows));
    const previousHistory = visitHistoryRef.current;
    const previousIndex = visitIndexRef.current;
    let nextHistory = previousHistory.filter((id) => availableIds.has(id));
    let nextIndex = previousIndex;

    if (activeWindowId && windows[activeWindowId]?.minimized && !showDesktopStash) {
      pendingHistoryTargetRef.current = activeWindowId;
      restoreWindow(activeWindowId);
      return;
    }

    if (previousHistory.length === 0 && availableIds.size > 0) {
      nextHistory = Object.values(windows)
        .sort((left, right) => left.zIndex - right.zIndex)
        .map((win) => win.id);
      nextIndex = activeWindowId ? nextHistory.indexOf(activeWindowId) : nextHistory.length - 1;
    } else if (pendingHistoryTargetRef.current && activeWindowId === pendingHistoryTargetRef.current) {
      nextIndex = nextHistory.indexOf(activeWindowId);
      pendingHistoryTargetRef.current = null;
    } else if (activeWindowId) {
      if (lastActiveWindowIdRef.current === activeWindowId) {
        nextIndex = nextHistory.indexOf(activeWindowId);
      } else {
        const prefix = nextHistory
          .slice(0, Math.max(0, previousIndex + 1))
          .filter((id) => id !== activeWindowId);
        nextHistory = [...prefix, activeWindowId];
        nextIndex = nextHistory.length - 1;
      }
    } else if (!showDesktopStash && lastActiveWindowIdRef.current) {
      const previousActiveId = lastActiveWindowIdRef.current;
      const previousWindow = windows[previousActiveId];
      if (previousWindow?.minimized) {
        // 전체화면 셸에서는 최소화가 화면 상태를 바꾸지 않는다. 진행 중 사진 작업처럼
        // 기존 코드가 최소화를 호출해도 같은 앱을 바로 복원한다.
        pendingHistoryTargetRef.current = previousActiveId;
        restoreWindow(previousActiveId);
      } else if (previousWindow) {
        // 바탕화면 보기에서 돌아올 때 직전에 보던 앱을 복원한다.
        pendingHistoryTargetRef.current = previousActiveId;
        focusWindow(previousActiveId);
      } else {
        // 활성 앱이 닫혔다면 기록에서 그 앱을 빼고 직전 앱으로 돌아간다.
        const targetIndex = Math.min(previousIndex - 1, nextHistory.length - 1);
        const targetId = targetIndex >= 0 ? nextHistory[targetIndex] : undefined;
        if (targetId) {
          nextIndex = targetIndex;
          pendingHistoryTargetRef.current = targetId;
          if (windows[targetId]?.minimized) restoreWindow(targetId);
          else focusWindow(targetId);
        }
      }
    }

    visitHistoryRef.current = nextHistory;
    visitIndexRef.current = nextIndex;
    if (activeWindowId) lastActiveWindowIdRef.current = activeWindowId;
    else if (!showDesktopStash && lastActiveWindowIdRef.current && !availableIds.has(lastActiveWindowIdRef.current)) {
      lastActiveWindowIdRef.current = null;
    }
  }, [activeWindowId, focusWindow, restoreWindow, showDesktopStash, windows]);

  const moveThroughHistory = useCallback((direction: -1 | 1) => {
    const history = visitHistoryRef.current;
    const nextIndex = visitIndexRef.current + direction;
    const targetId = history[nextIndex];
    if (!targetId || !useOliviaDesktopStore.getState().windows[targetId]) return false;
    visitIndexRef.current = nextIndex;
    pendingHistoryTargetRef.current = targetId;
    const target = useOliviaDesktopStore.getState().windows[targetId];
    if (target.minimized) restoreWindow(targetId);
    else focusWindow(targetId);
    return true;
  }, [focusWindow, restoreWindow]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!event.metaKey && !event.ctrlKey) return;
      const direction = event.key === "[" || event.code === "BracketLeft"
        ? -1
        : event.key === "]" || event.code === "BracketRight"
          ? 1
          : null;
      if (direction && moveThroughHistory(direction)) event.preventDefault();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [moveThroughHistory]);

  useEffect(() => {
    const move = (event: Event) => {
      const direction = (event as CustomEvent<{ direction?: -1 | 1 }>).detail?.direction;
      if (!direction) return;
      if (moveThroughHistory(direction)) return;
      const state = useOliviaDesktopStore.getState();
      if (direction === -1 && state.activeWindowId) toggleShowDesktop();
      else if (direction === 1 && !state.activeWindowId && state.showDesktopStash?.length) toggleShowDesktop();
    };
    window.addEventListener("olivia-desktop-history", move);
    return () => window.removeEventListener("olivia-desktop-history", move);
  }, [moveThroughHistory, toggleShowDesktop]);

  const activeWindow = activeWindowId ? windows[activeWindowId] : undefined;
  const activeApp = activeWindow
    ? oliviaAppRegistry.find((candidate) => candidate.id === activeWindow.appId)
    : undefined;
  const ActiveContent = activeApp?.component;

  return (
    <main
      ref={surfaceRef}
      className={styles.surface}
      aria-label="앱 작업 공간"
      onContextMenu={(event) => {
        if ((event.target as HTMLElement).closest("[data-app-window]")) return;
        event.preventDefault();
        onDesktopContextMenu?.(
          Math.min(event.clientX, window.innerWidth - 224),
          Math.min(event.clientY, window.innerHeight - 110),
        );
      }}
    >
      <div className={styles.windowLayer}>
        {activeWindow && activeApp && ActiveContent && !activeWindow.minimized ? (
          <AppWindow windowId={activeWindow.id} workspaceRef={surfaceRef} minWidth={activeApp.minSize?.width} minHeight={activeApp.minSize?.height}>
            <DesktopCaseChrome appId={activeWindow.appId} context={activeWindow.context}>
              <ActiveContent
                key={getDesktopContentKey({ windowId: activeWindow.id, appId: activeWindow.appId, context: activeWindow.context })}
                context={activeWindow.context}
              />
            </DesktopCaseChrome>
          </AppWindow>
        ) : <TodayWindowContent />}
      </div>
    </main>
  );
}
