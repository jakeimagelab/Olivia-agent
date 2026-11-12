export type VirtualGridRangeInput = {
  itemCount: number;
  columns: number;
  rowHeight: number;
  scrollTop: number;
  viewportHeight: number;
  gridOffsetTop?: number;
  overscanRows?: number;
};

export function virtualGridScrollTop({
  index,
  columns,
  rowHeight,
  gridOffsetTop = 0,
}: {
  index: number;
  columns: number;
  rowHeight: number;
  gridOffsetTop?: number;
}) {
  const safeIndex = Math.max(0, Math.trunc(index));
  const safeColumns = Math.max(1, Math.trunc(columns));
  return Math.max(0, gridOffsetTop + Math.floor(safeIndex / safeColumns) * Math.max(1, rowHeight));
}

export function virtualGridRange({
  itemCount,
  columns,
  rowHeight,
  scrollTop,
  viewportHeight,
  gridOffsetTop = 0,
  overscanRows = 3,
}: VirtualGridRangeInput) {
  const safeCount = Math.max(0, Math.trunc(itemCount));
  const safeColumns = Math.max(1, Math.trunc(columns));
  const safeRowHeight = Math.max(1, rowHeight);
  const rowCount = Math.ceil(safeCount / safeColumns);
  if (!safeCount) return { start: 0, end: 0, topPadding: 0, bottomPadding: 0, rowCount: 0, totalHeight: 0 };

  const relativeScrollTop = Math.max(0, scrollTop - gridOffsetTop);
  const firstVisibleRow = Math.min(rowCount - 1, Math.floor(relativeScrollTop / safeRowHeight));
  const visibleRowCount = Math.max(1, Math.ceil(Math.max(1, viewportHeight) / safeRowHeight));
  const startRow = Math.max(0, firstVisibleRow - overscanRows);
  const endRow = Math.min(rowCount, firstVisibleRow + visibleRowCount + overscanRows);
  const start = Math.min(safeCount, startRow * safeColumns);
  const end = Math.min(safeCount, endRow * safeColumns);
  return {
    start,
    end,
    topPadding: startRow * safeRowHeight,
    bottomPadding: Math.max(0, (rowCount - endRow) * safeRowHeight),
    rowCount,
    totalHeight: rowCount * safeRowHeight,
  };
}

export function isVirtualGridNearEnd({
  end,
  itemCount,
  columns,
  thresholdRows = 4,
}: {
  end: number;
  itemCount: number;
  columns: number;
  thresholdRows?: number;
}) {
  if (itemCount <= 0) return false;
  const threshold = Math.max(1, Math.trunc(columns)) * Math.max(1, Math.trunc(thresholdRows));
  return end >= Math.max(0, itemCount - threshold);
}
