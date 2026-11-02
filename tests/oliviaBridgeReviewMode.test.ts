import { describe, expect, it } from "vitest";

import {
  bridgeKeyboardRangeSelection,
  bridgeReviewDeckWindow,
  bridgeReviewLayout,
  cycleBridgeReviewIndex,
  removeBridgeReviewItem,
  restoreBridgeReviewItem,
} from "@/lib/photo-bridge/reviewMode";

describe("Olivia Bridge keyboard range selection", () => {
  it("extends and shrinks from the same anchor", () => {
    const orderedIds = ["a", "b", "c", "d", "e"];
    expect([...bridgeKeyboardRangeSelection({ orderedIds, anchorId: "b", targetId: "e" })]).toEqual(["b", "c", "d", "e"]);
    expect([...bridgeKeyboardRangeSelection({ orderedIds, anchorId: "b", targetId: "c" })]).toEqual(["b", "c"]);
    expect([...bridgeKeyboardRangeSelection({ orderedIds, anchorId: "d", targetId: "b" })]).toEqual(["b", "c", "d"]);
  });
});

describe("Olivia Bridge selection review", () => {
  it("chooses single, comparison grid, and layered deck layouts", () => {
    expect(bridgeReviewLayout(1)).toBe("single");
    expect(bridgeReviewLayout(4)).toBe("grid");
    expect(bridgeReviewLayout(5)).toBe("deck");
  });

  it("cycles in both directions", () => {
    expect(cycleBridgeReviewIndex(3, 4, 1)).toBe(0);
    expect(cycleBridgeReviewIndex(0, 4, -1)).toBe(3);
  });

  it("removes the active item and restores it to its original order", () => {
    const removed = removeBridgeReviewItem(["a", "b", "c"], "b");
    expect(removed.remainingIds).toEqual(["a", "c"]);
    expect(removed.nextActiveId).toBe("c");
    expect(restoreBridgeReviewItem(removed.remainingIds, removed.removed)).toEqual({ restoredIds: ["a", "b", "c"], activeId: "b" });
  });

  it("builds a bounded circular window around a large deck", () => {
    const window = bridgeReviewDeckWindow(["a", "b", "c", "d", "e", "f", "g", "h"], 0);
    expect(window).toHaveLength(7);
    expect(window.find(({ offset }) => offset === 0)?.item).toBe("a");
    expect(window[0]).toEqual({ item: "f", offset: -3 });
  });
});
