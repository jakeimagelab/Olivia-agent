export const COMPACT_CHAT_MAX_WIDTH = 420;
export const COMPACT_CHAT_MIN_WIDTH = 180;
export const COMPACT_CHAT_EDGE_INSET = 18;
export const COMPACT_CHAT_DOCK_GAP = 12;

/**
 * Keep the Dock centered and fit compact chat into the free space on its right.
 * The desktop shell does not use this layout at phone widths, but the viewport
 * clamp still prevents overflow while the responsive shell is switching.
 */
export function calculateCompactChatWidth(workspaceWidth: number, dockWidth: number) {
  if (workspaceWidth <= 0) return COMPACT_CHAT_MAX_WIDTH;

  const viewportWidth = Math.max(0, workspaceWidth - COMPACT_CHAT_EDGE_INSET - 6);
  const dockAdjacentWidth = dockWidth > 0
    ? Math.max(
        COMPACT_CHAT_MIN_WIDTH,
        (workspaceWidth - dockWidth) / 2 - COMPACT_CHAT_EDGE_INSET - COMPACT_CHAT_DOCK_GAP,
      )
    : COMPACT_CHAT_MAX_WIDTH;

  return Math.min(COMPACT_CHAT_MAX_WIDTH, viewportWidth, dockAdjacentWidth);
}
