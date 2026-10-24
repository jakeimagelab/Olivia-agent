export type BridgeResizablePane = "folder" | "preview";

export const BRIDGE_PANE_DEFAULT_WIDTH: Record<BridgeResizablePane, number> = {
  folder: 210,
  preview: 300,
};

const BRIDGE_PANE_MIN_WIDTH: Record<BridgeResizablePane, number> = {
  folder: 150,
  preview: 240,
};

const BRIDGE_PANE_MAX_WIDTH: Record<BridgeResizablePane, number> = {
  folder: 360,
  preview: 560,
};

const BRIDGE_DIVIDERS_WIDTH = 18;

export function bridgeCenterMinimum(containerWidth: number) {
  return containerWidth < 980 ? 320 : 420;
}

export function clampBridgePaneWidth(input: {
  pane: BridgeResizablePane;
  requestedWidth: number;
  containerWidth: number;
  oppositePaneWidth: number;
}) {
  const minimum = BRIDGE_PANE_MIN_WIDTH[input.pane];
  const maximumForCenter = input.containerWidth
    - input.oppositePaneWidth
    - bridgeCenterMinimum(input.containerWidth)
    - BRIDGE_DIVIDERS_WIDTH;
  const maximum = Math.max(
    minimum,
    Math.min(BRIDGE_PANE_MAX_WIDTH[input.pane], maximumForCenter),
  );

  return Math.round(Math.min(maximum, Math.max(minimum, input.requestedWidth)));
}

export function bridgePaneWidthFromPointer(input: {
  pane: BridgeResizablePane;
  pointerX: number;
  containerLeft: number;
  containerRight: number;
}) {
  return input.pane === "folder"
    ? input.pointerX - input.containerLeft
    : input.containerRight - input.pointerX;
}
