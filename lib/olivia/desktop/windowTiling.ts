export type WindowTileBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export const WINDOW_TILE_GAP = 8;

/**
 * Calculates visual cells only. The desktop store remains responsible for
 * selecting windows and retaining/restoring the pre-tile snapshot.
 */
export function calculateWindowTileBounds(
  count: number,
  workspaceWidth: number,
  workspaceHeight: number,
  gap = WINDOW_TILE_GAP,
): WindowTileBounds[] {
  if (count <= 0) return [];

  const cols = Math.ceil(Math.sqrt(count));
  const rows = Math.ceil(count / cols);
  const width = Math.max(1, workspaceWidth);
  const height = Math.max(1, workspaceHeight);
  const rowHeight = Math.max(1, (height - gap * (rows - 1)) / rows);

  return Array.from({ length: count }, (_, index) => {
    const row = Math.floor(index / cols);
    const rowStart = row * cols;
    const cellsInRow = row === rows - 1 ? count - rowStart : cols;
    const column = index - rowStart;
    const columnWidth = Math.max(1, (width - gap * (cellsInRow - 1)) / cellsInRow);
    return {
      x: Math.round(column * (columnWidth + gap)),
      y: Math.round(row * (rowHeight + gap)),
      width: Math.max(1, Math.round(columnWidth)),
      height: Math.max(1, Math.round(rowHeight)),
    };
  });
}
