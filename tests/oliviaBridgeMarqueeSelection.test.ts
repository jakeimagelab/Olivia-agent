import { describe, expect, it } from "vitest";

import {
  bridgeMarqueeSelection,
  bridgeMarqueeUsesAdditiveSelection,
  bridgeRectangleFromPoints,
  bridgeRectanglesIntersect,
} from "@/lib/photo-bridge/marqueeSelection";

describe("Olivia Bridge marquee selection", () => {
  it("normalizes a drag rectangle in every direction", () => {
    expect(bridgeRectangleFromPoints({ x: 180, y: 140 }, { x: 40, y: 20 })).toEqual({
      left: 40,
      top: 20,
      right: 180,
      bottom: 140,
    });
  });

  it("selects cards that touch the marquee boundary", () => {
    const marquee = { left: 10, top: 10, right: 100, bottom: 100 };
    expect(bridgeRectanglesIntersect(marquee, { left: 100, top: 40, right: 160, bottom: 80 })).toBe(true);
    expect(bridgeRectanglesIntersect(marquee, { left: 101, top: 40, right: 160, bottom: 80 })).toBe(false);
  });

  it("replaces the selection for a normal drag", () => {
    expect([...bridgeMarqueeSelection({
      initial: new Set(["old"]),
      hits: new Set(["photo-1", "photo-2"]),
      additive: false,
    })]).toEqual(["photo-1", "photo-2"]);
  });

  it("adds marquee hits when Command or Control is held", () => {
    expect([...bridgeMarqueeSelection({
      initial: new Set(["old"]),
      hits: new Set(["photo-1", "photo-2"]),
      additive: true,
    })]).toEqual(["old", "photo-1", "photo-2"]);
  });

  it("treats Command, Control, and Shift as additive marquee modifiers", () => {
    expect(bridgeMarqueeUsesAdditiveSelection({ metaKey: true, ctrlKey: false, shiftKey: false })).toBe(true);
    expect(bridgeMarqueeUsesAdditiveSelection({ metaKey: false, ctrlKey: true, shiftKey: false })).toBe(true);
    expect(bridgeMarqueeUsesAdditiveSelection({ metaKey: false, ctrlKey: false, shiftKey: true })).toBe(true);
    expect(bridgeMarqueeUsesAdditiveSelection({ metaKey: false, ctrlKey: false, shiftKey: false })).toBe(false);
  });
});
