export type BridgeFloatingWindowRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type BridgeFloatingWindowBounds = {
  width: number;
  height: number;
};

export type BridgeFloatingWindowPreset = {
  preferredWidth: number;
  preferredHeight: number;
  minWidth: number;
  minHeight: number;
  top: number;
  gap: number;
};

export type BridgeFloatingWindowResizeEdge = "east" | "south" | "southeast";

export const BRIDGE_FLOATING_WINDOW_PRESETS = {
  tool: {
    preferredWidth: 920,
    preferredHeight: 700,
    minWidth: 520,
    minHeight: 360,
    top: 76,
    gap: 18,
  },
  scene: {
    preferredWidth: 700,
    preferredHeight: 610,
    minWidth: 420,
    minHeight: 360,
    top: 76,
    gap: 18,
  },
} satisfies Record<string, BridgeFloatingWindowPreset>;

function clamp(value: number, minimum: number, maximum: number) {
  if (maximum < minimum) return maximum;
  return Math.min(maximum, Math.max(minimum, value));
}

function availableSize(bounds: BridgeFloatingWindowBounds, gap: number) {
  return {
    width: Math.max(1, bounds.width - gap * 2),
    height: Math.max(1, bounds.height - gap * 2),
  };
}

export function clampBridgeFloatingWindowRect(
  rect: BridgeFloatingWindowRect,
  bounds: BridgeFloatingWindowBounds,
  preset: BridgeFloatingWindowPreset,
): BridgeFloatingWindowRect {
  const available = availableSize(bounds, preset.gap);
  const effectiveMinWidth = Math.min(preset.minWidth, available.width);
  const effectiveMinHeight = Math.min(preset.minHeight, available.height);
  const width = clamp(rect.width, effectiveMinWidth, available.width);
  const height = clamp(rect.height, effectiveMinHeight, available.height);
  const maximumX = Math.max(preset.gap, bounds.width - preset.gap - width);
  const maximumY = Math.max(preset.gap, bounds.height - preset.gap - height);

  return {
    x: clamp(rect.x, preset.gap, maximumX),
    y: clamp(rect.y, preset.gap, maximumY),
    width,
    height,
  };
}

export function createBridgeFloatingWindowRect(
  bounds: BridgeFloatingWindowBounds,
  preset: BridgeFloatingWindowPreset,
): BridgeFloatingWindowRect {
  const available = availableSize(bounds, preset.gap);
  const width = Math.min(preset.preferredWidth, available.width);
  const height = Math.min(preset.preferredHeight, available.height);

  return clampBridgeFloatingWindowRect({
    x: bounds.width - preset.gap - width,
    y: preset.top,
    width,
    height,
  }, bounds, preset);
}

export function moveBridgeFloatingWindowRect(
  rect: BridgeFloatingWindowRect,
  deltaX: number,
  deltaY: number,
  bounds: BridgeFloatingWindowBounds,
  preset: BridgeFloatingWindowPreset,
) {
  return clampBridgeFloatingWindowRect({
    ...rect,
    x: rect.x + deltaX,
    y: rect.y + deltaY,
  }, bounds, preset);
}

export function resizeBridgeFloatingWindowRect(
  rect: BridgeFloatingWindowRect,
  deltaX: number,
  deltaY: number,
  edge: BridgeFloatingWindowResizeEdge,
  bounds: BridgeFloatingWindowBounds,
  preset: BridgeFloatingWindowPreset,
) {
  const maximumWidth = Math.max(1, bounds.width - preset.gap - rect.x);
  const maximumHeight = Math.max(1, bounds.height - preset.gap - rect.y);
  const minimumWidth = Math.min(preset.minWidth, maximumWidth);
  const minimumHeight = Math.min(preset.minHeight, maximumHeight);
  return clampBridgeFloatingWindowRect({
    ...rect,
    width: clamp(
      rect.width + (edge === "east" || edge === "southeast" ? deltaX : 0),
      minimumWidth,
      maximumWidth,
    ),
    height: clamp(
      rect.height + (edge === "south" || edge === "southeast" ? deltaY : 0),
      minimumHeight,
      maximumHeight,
    ),
  }, bounds, preset);
}

export function bridgeFloatingWindowRectsEqual(
  left: BridgeFloatingWindowRect | undefined,
  right: BridgeFloatingWindowRect,
) {
  if (!left) return false;
  return left.x === right.x
    && left.y === right.y
    && left.width === right.width
    && left.height === right.height;
}
