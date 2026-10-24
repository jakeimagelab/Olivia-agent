export type BridgePoint = { x: number; y: number };
export type BridgeRectangle = { left: number; top: number; right: number; bottom: number };

export function bridgeRectangleFromPoints(start: BridgePoint, end: BridgePoint): BridgeRectangle {
  return {
    left: Math.min(start.x, end.x),
    top: Math.min(start.y, end.y),
    right: Math.max(start.x, end.x),
    bottom: Math.max(start.y, end.y),
  };
}

export function bridgeRectanglesIntersect(left: BridgeRectangle, right: BridgeRectangle) {
  return left.left <= right.right
    && left.right >= right.left
    && left.top <= right.bottom
    && left.bottom >= right.top;
}

export function bridgeMarqueeSelection(input: {
  initial: ReadonlySet<string>;
  hits: ReadonlySet<string>;
  additive: boolean;
}) {
  if (!input.additive) return new Set(input.hits);
  return new Set([...input.initial, ...input.hits]);
}
