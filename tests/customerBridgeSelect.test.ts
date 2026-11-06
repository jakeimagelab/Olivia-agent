import { describe, expect, it } from "vitest";

import {
  addCustomerBridgeRange,
  applyCustomerBridgeRating,
  customerSelectionComparisonCounts,
  matchCustomerSelectionToBridgeFiles,
  matchesCustomerSelectionComparison,
  normalizeGalleryRelativePath,
  toggleCustomerBridgeSelection,
} from "@/lib/select-gallery/customerBridge";

describe("customer Bridge selection", () => {
  it("keeps click selection cumulative and 0 removes rating and selection", () => {
    const first = toggleCustomerBridgeSelection({ selectedIds: new Set(["a"]), ratings: {} }, "b");
    expect([...first.selectedIds]).toEqual(["a", "b"]);
    const rated = applyCustomerBridgeRating(first, new Set(["b"]), 4);
    expect(rated.selectedIds.has("b")).toBe(true);
    expect(rated.ratings.b).toBe(4);
    const cleared = applyCustomerBridgeRating(rated, new Set(["b"]), 0);
    expect(cleared.selectedIds.has("b")).toBe(false);
    expect(cleared.ratings.b).toBeUndefined();
  });

  it("adds a keyboard or click range without discarding the previous selection", () => {
    expect([...addCustomerBridgeRange({
      current: new Set(["z"]),
      orderedIds: ["a", "b", "c", "d"],
      anchorId: "b",
      targetId: "d",
    })]).toEqual(["z", "b", "c", "d"]);
  });
});

describe("customer/admin comparison", () => {
  const ids = ["a", "b", "c", "d"];
  const admin = new Set(["a", "b"]);
  const customer = new Set(["b", "c"]);

  it("calculates intersections and differences independently", () => {
    expect(customerSelectionComparisonCounts(ids, admin, customer)).toEqual({
      all: 4,
      admin: 2,
      customer: 2,
      common: 1,
      "admin-only": 1,
      "customer-only": 1,
    });
    expect(ids.filter((id) => matchesCustomerSelectionComparison({ id, filter: "common", adminIds: admin, customerIds: customer }))).toEqual(["b"]);
    expect(ids.filter((id) => matchesCustomerSelectionComparison({ id, filter: "admin-only", adminIds: admin, customerIds: customer }))).toEqual(["a"]);
    expect(ids.filter((id) => matchesCustomerSelectionComparison({ id, filter: "customer-only", adminIds: admin, customerIds: customer }))).toEqual(["c"]);
  });
});

describe("customer selection folder matching", () => {
  const files = [
    { id: "bridge-a", name: "IMG_0001.JPG", relativeDirectory: "Scene 1" },
    { id: "bridge-b", name: "IMG_0001.JPG", relativeDirectory: "Scene 2" },
    { id: "bridge-c", name: "IMG_0002.JPG", relativeDirectory: "Scene 2" },
    { id: "bridge-d", name: "IMG_0003.JPG", galleryImageId: "image-direct" },
  ];

  it("normalizes separators and NFC paths", () => {
    expect(normalizeGalleryRelativePath(" Scene 1\\IMG_0001.JPG ")).toBe("scene 1/img_0001.jpg");
  });

  it("prefers image ID, then exact relative path, then a unique basename", () => {
    const result = matchCustomerSelectionToBridgeFiles([
      { imageId: "image-direct", fileName: "renamed.jpg", rating: 5 },
      { imageId: "image-path", fileName: "IMG_0001.JPG", relativePath: "Scene 2/IMG_0001.JPG", memo: "피부 정리" },
      { imageId: "image-leaf", fileName: "IMG_0002.JPG" },
    ], files);
    expect([...result.matchedBridgeIds]).toEqual(["bridge-d", "bridge-b", "bridge-c"]);
    expect(result.ratingsByBridgeId["bridge-d"]).toBe(5);
    expect(result.notesByBridgeId["bridge-b"]).toBe("피부 정리");
    expect(result.missing).toEqual([]);
    expect(result.ambiguous).toEqual([]);
  });

  it("never chooses the first duplicate basename", () => {
    const result = matchCustomerSelectionToBridgeFiles([
      { imageId: "legacy", fileName: "IMG_0001.JPG" },
      { imageId: "missing", fileName: "IMG_9999.JPG" },
    ], files);
    expect(result.matchedBridgeIds.size).toBe(0);
    expect(result.ambiguous[0]).toMatchObject({ imageId: "legacy", candidateIds: ["bridge-a", "bridge-b"] });
    expect(result.missing[0].imageId).toBe("missing");
  });
});
