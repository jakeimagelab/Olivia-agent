export const DOCK_ICON_SIZES = [48, 40, 34] as const;

export type DockIconSize = (typeof DOCK_ICON_SIZES)[number];

export type DockLayout = {
  iconSize: DockIconSize;
  scrollable: boolean;
};

const DOCK_GAP = 6;
const DOCK_HORIZONTAL_PADDING = 20;
const DOCK_BUTTON_EXTRA_WIDTH = 4;
const DOCK_DIVIDER_WIDTH = 7;
const DOCK_MAX_WIDTH_RATIO = 0.9;

export function getRequiredDockWidth(
  iconSize: DockIconSize,
  buttonCount: number,
  dividerCount = 2,
) {
  const childCount = buttonCount + dividerCount;
  const gapsWidth = Math.max(0, childCount - 1) * DOCK_GAP;

  return DOCK_HORIZONTAL_PADDING
    + buttonCount * (iconSize + DOCK_BUTTON_EXTRA_WIDTH)
    + dividerCount * DOCK_DIVIDER_WIDTH
    + gapsWidth;
}

export function resolveDockLayout(
  availableWidth: number,
  buttonCount: number,
  dividerCount = 2,
): DockLayout {
  const widthLimit = Math.max(0, availableWidth) * DOCK_MAX_WIDTH_RATIO;
  const fittingSize = DOCK_ICON_SIZES.find(
    (iconSize) => getRequiredDockWidth(iconSize, buttonCount, dividerCount) <= widthLimit,
  );

  return fittingSize
    ? { iconSize: fittingSize, scrollable: false }
    : { iconSize: 34, scrollable: true };
}
