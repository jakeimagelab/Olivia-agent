import type { OliviaWindowState } from "@/lib/store/useOliviaDesktopStore";

export const WINDOW_DOCK_GAP = 8;
export const WINDOW_DOCK_THRESHOLD = 52;

export type WindowBounds = { x: number; y: number; width: number; height: number };
export type WindowDockLayout = { parent: WindowBounds; child: WindowBounds };

function verticalOverlap(a: WindowBounds, b: WindowBounds) {
  return Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
}

export function findDockParent(
  child: WindowBounds,
  windows: OliviaWindowState[],
  childId: string,
): OliviaWindowState | undefined {
  return windows
    .filter((candidate) => candidate.id !== childId && candidate.appId !== "olivia-chat" && candidate.appId !== "all-apps" && !candidate.minimized)
    .map((candidate) => ({
      candidate,
      distance: Math.abs(child.x - (candidate.x + candidate.width + WINDOW_DOCK_GAP)),
      overlap: verticalOverlap(child, candidate),
    }))
    .filter(({ distance, overlap, candidate }) => distance <= WINDOW_DOCK_THRESHOLD && overlap >= Math.min(100, candidate.height * 0.25, child.height * 0.25))
    .sort((a, b) => a.distance - b.distance || b.overlap - a.overlap)[0]?.candidate;
}

export function resolveDockLayout(
  parent: WindowBounds,
  child: WindowBounds,
  workspaceWidth: number,
  workspaceHeight: number,
  dockSafeArea: number,
  childMinWidth = 340,
): WindowDockLayout | null {
  const edge = 12;
  const usableWidth = Math.max(0, workspaceWidth - edge * 2);
  const maxHeight = Math.max(240, workspaceHeight - dockSafeArea - edge - Math.max(edge, parent.y));
  let childWidth = child.width;
  if (parent.width + WINDOW_DOCK_GAP + childWidth > usableWidth) {
    childWidth = Math.max(childMinWidth, usableWidth - parent.width - WINDOW_DOCK_GAP);
  }
  if (parent.width + WINDOW_DOCK_GAP + childWidth > usableWidth) return null;

  const groupWidth = parent.width + WINDOW_DOCK_GAP + childWidth;
  const parentX = Math.max(edge, Math.min(parent.x, workspaceWidth - edge - groupWidth));
  const parentY = Math.max(edge, Math.min(parent.y, workspaceHeight - dockSafeArea - 240));
  const height = Math.min(parent.height, maxHeight);
  return {
    parent: { x: Math.round(parentX), y: Math.round(parentY), width: parent.width, height: Math.round(height) },
    child: {
      x: Math.round(parentX + parent.width + WINDOW_DOCK_GAP),
      y: Math.round(parentY),
      width: Math.round(childWidth),
      height: Math.round(height),
    },
  };
}

export function followDockedParent(parent: WindowBounds, child: WindowBounds): WindowBounds {
  return {
    ...child,
    x: Math.round(parent.x + parent.width + WINDOW_DOCK_GAP),
    y: Math.round(parent.y),
    height: Math.round(parent.height),
  };
}
