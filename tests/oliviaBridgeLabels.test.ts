import { describe, expect, it } from "vitest";

import {
  bridgeLabelFilterCommandFromShortcutCode,
  bridgeLabelFilterName,
  countBridgeLabeledFiles,
  hasBridgeLabel,
  matchesBridgeSelectionView,
  matchesBridgeLabelFilter,
  normalizeBridgeColorLabels,
  resolveBridgeRatings,
  toggleBridgeColorLabel,
  updateBridgeRatingEdits,
  updateBridgeRatings,
} from "@/lib/photo-bridge/labels";

describe("Olivia Bridge labels", () => {
  it("keeps app edits, including an explicit clear, above later Adobe refreshes", () => {
    const targets = new Set(["photo-a"]);
    const five = updateBridgeRatingEdits({}, targets, 5);
    expect(resolveBridgeRatings({}, { "photo-a": 3 }, five)).toEqual({ "photo-a": 5 });

    const cleared = updateBridgeRatingEdits(five, targets, 0);
    expect(resolveBridgeRatings({}, { "photo-a": 4 }, cleared)).toEqual({});
    expect(cleared).toEqual({ "photo-a": 0 });
  });

  it("loads only supported color label shortcuts from stored data", () => {
    expect(normalizeBridgeColorLabels({ a: 6, b: 9, c: 5, d: "8" })).toEqual({ a: 6, b: 9 });
    expect(normalizeBridgeColorLabels(null)).toEqual({});
  });

  it("sets a color without changing ratings and clears it when pressed again", () => {
    const targets = new Set(["a", "b"]);
    const applied = toggleBridgeColorLabel({ a: 7 }, targets, 8);
    expect(applied).toEqual({ a: 8, b: 8 });
    expect(toggleBridgeColorLabel(applied, targets, 8)).toEqual({});
  });

  it("sets ratings from 1 to 5 and resets only the rating with 0", () => {
    const targets = new Set(["a"]);
    const colors = { a: 8 } as const;
    expect(updateBridgeRatings({}, targets, 5)).toEqual({ a: 5 });
    expect(updateBridgeRatings({ a: 5, b: 2 }, targets, 0)).toEqual({ b: 2 });
    expect(colors).toEqual({ a: 8 });
  });

  it("keeps other files and other label colors unchanged", () => {
    expect(toggleBridgeColorLabel({ a: 6, outside: 9 }, new Set(["a", "b"]), 6)).toEqual({
      a: 6,
      b: 6,
      outside: 9,
    });
  });

  it("counts the union of star-rated and color-labeled JPGs", () => {
    const ratings = { a: 5, b: 2 };
    const colors = { b: 6, c: 9 } as const;
    expect(hasBridgeLabel("a", ratings, colors)).toBe(true);
    expect(hasBridgeLabel("c", ratings, colors)).toBe(true);
    expect(hasBridgeLabel("d", ratings, colors)).toBe(false);
    expect(countBridgeLabeledFiles(["a", "b", "c", "d"], ratings, colors)).toBe(3);
  });

  it("separates star, color, all selection, and unselected views", () => {
    const ratings = { star: 5, both: 2 };
    const colors = { color: 8, both: 6 } as const;

    expect(["star", "color", "both", "none"].filter((id) => matchesBridgeSelectionView(id, "starred", ratings, colors))).toEqual(["star", "both"]);
    expect(["star", "color", "both", "none"].filter((id) => matchesBridgeSelectionView(id, "colored", ratings, colors))).toEqual(["color", "both"]);
    expect(["star", "color", "both", "none"].filter((id) => matchesBridgeSelectionView(id, "selected", ratings, colors))).toEqual(["star", "color", "both"]);
    expect(["star", "color", "both", "none"].filter((id) => matchesBridgeSelectionView(id, "unselected", ratings, colors))).toEqual(["none"]);
  });

  it("maps macOS shortcut codes to exact label filters", () => {
    expect(bridgeLabelFilterCommandFromShortcutCode("Digit1")).toEqual({ kind: "rating", rating: 1 });
    expect(bridgeLabelFilterCommandFromShortcutCode("Digit5")).toEqual({ kind: "rating", rating: 5 });
    expect(bridgeLabelFilterCommandFromShortcutCode("Digit6")).toEqual({ kind: "color", label: 6 });
    expect(bridgeLabelFilterCommandFromShortcutCode("Digit9")).toEqual({ kind: "color", label: 9 });
    expect(bridgeLabelFilterCommandFromShortcutCode("KeyA")).toEqual({ kind: "all" });
    expect(bridgeLabelFilterCommandFromShortcutCode("Digit0")).toBeNull();
  });

  it("matches only the exact rating or color while allowing both labels to coexist", () => {
    const ratings = { a: 3, b: 4, c: 3 };
    const colors = { a: 6, b: 6, c: 9 } as const;
    const ratingFilter = { kind: "rating", rating: 3 } as const;
    const colorFilter = { kind: "color", label: 6 } as const;

    expect(["a", "b", "c"].filter((id) => matchesBridgeLabelFilter(id, ratingFilter, ratings, colors))).toEqual(["a", "c"]);
    expect(["a", "b", "c"].filter((id) => matchesBridgeLabelFilter(id, colorFilter, ratings, colors))).toEqual(["a", "b"]);
    expect(bridgeLabelFilterName(ratingFilter)).toBe("별점 3");
    expect(bridgeLabelFilterName(colorFilter)).toBe("빨강");
  });
});
