import { describe, expect, it } from "vitest";

import {
  addCustomerBridgeRange,
  applyCustomerColorLabels,
  applyCustomerRatings,
  applyCustomerBridgeRating,
  clearCustomerBridgeMarks,
  customerBridgeFolderTree,
  customerBridgeFolderView,
  customerBridgeRatedIds,
  customerBridgeRatingTargets,
  customerBridgeSelectedIds,
  customerBridgeSelectionItems,
  customerSelectionComparisonCounts,
  matchCustomerSelectionToBridgeFiles,
  matchesCustomerSelectionComparison,
  normalizeGalleryRelativePath,
  normalizeCustomerBridgeSelectionMarks,
  nextCustomerBridgeReviewZoom,
  toggleCustomerColorLabels,
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

  it("keeps work targets separate until a number rating is applied", () => {
    const activeImageIds = new Set(["a", "b", "c"]);
    expect(customerBridgeRatedIds({}).size).toBe(0);
    const ratings = applyCustomerRatings({}, customerBridgeRatingTargets(activeImageIds, "a"), 3);
    expect(ratings).toEqual({ a: 3, b: 3, c: 3 });
    expect([...customerBridgeRatedIds(ratings)]).toEqual(["a", "b", "c"]);
  });

  it("uses the focused photo only when there is no work target and 0 removes only targets", () => {
    expect([...customerBridgeRatingTargets(new Set(), "focused")]).toEqual(["focused"]);
    const ratings = applyCustomerRatings({ a: 5, b: 4, c: 2 }, new Set(["a", "c"]), 0);
    expect(ratings).toEqual({ b: 4 });
  });

  it("can reset every persisted mark and note without changing the photo list", () => {
    const ids = new Set(["a", "b"]);
    const ratings = clearCustomerBridgeMarks({ a: 5, b: 3 }, ids);
    const colors = clearCustomerBridgeMarks({ a: 8, b: 7 }, ids);
    expect(customerBridgeSelectionItems([
      { id: "a", relative_path: "C1/a.jpg" },
      { id: "b", relative_path: "C1/b.jpg" },
    ], ratings, colors, {})).toEqual([]);
  });

  it("submits only rated photos with their path, rating, and memo", () => {
    expect(customerBridgeSelectionItems([
      { id: "a", relative_path: "C1/a.jpg" },
      { id: "b", relative_path: "C2/b.jpg" },
      { id: "c", relative_path: "C3/c.jpg" },
    ], { a: 5, c: 3 }, {}, { a: "피부 정리", b: "제출되면 안 됨" })).toEqual([
      { imageId: "a", relativePath: "C1/a.jpg", rating: 5, colorLabel: null, memo: "피부 정리" },
      { imageId: "c", relativePath: "C3/c.jpg", rating: 3, colorLabel: null, memo: "" },
    ]);
  });

  it("keeps 6–9 color selections independent and counts the union once", () => {
    const ratings = { a: 5, b: 3 } as const;
    const colors = applyCustomerColorLabels({}, new Set(["b", "c"]), 8);
    expect(colors).toEqual({ b: 8, c: 8 });
    expect([...customerBridgeSelectedIds(ratings, colors)]).toEqual(["a", "b", "c"]);
    expect(customerBridgeSelectionItems([
      { id: "a", relative_path: "C1/a.jpg" },
      { id: "b", relative_path: "C1/b.jpg" },
      { id: "c", relative_path: "C1/c.jpg" },
    ], ratings, colors, {})).toEqual([
      { imageId: "a", relativePath: "C1/a.jpg", rating: 5, colorLabel: null, memo: "" },
      { imageId: "b", relativePath: "C1/b.jpg", rating: 3, colorLabel: 8, memo: "" },
      { imageId: "c", relativePath: "C1/c.jpg", rating: null, colorLabel: 8, memo: "" },
    ]);
    expect(applyCustomerColorLabels(colors, new Set(["c"]), 8)).toEqual({ b: 8, c: 8 });
  });

  it("toggles the same 6–9 color off while preserving other targets", () => {
    const applied = toggleCustomerColorLabels({ a: 7, untouched: 9 }, new Set(["a", "b"]), 8);
    expect(applied).toEqual({ a: 8, b: 8, untouched: 9 });
    expect(toggleCustomerColorLabels(applied, new Set(["a", "b"]), 8)).toEqual({ untouched: 9 });
    expect(toggleCustomerColorLabels({ a: 8, b: 7 }, new Set(["a", "b"]), 8)).toEqual({ a: 8, b: 8 });
  });

  it("zooms review photos up on wheel-up and down on wheel-down within bounds", () => {
    expect(nextCustomerBridgeReviewZoom(1, -1)).toBe(1.15);
    expect(nextCustomerBridgeReviewZoom(1.15, 1)).toBe(1);
    expect(nextCustomerBridgeReviewZoom(1, 1)).toBe(1);
    expect(nextCustomerBridgeReviewZoom(2.95, -1)).toBe(3);
  });

  it("keeps classic selections when switching to Bridge without overwriting real marks", () => {
    expect(normalizeCustomerBridgeSelectionMarks({
      selectedImageIds: ["classic", "rated", "colored", "outside"],
      ratings: { rated: 4 },
      colorLabels: { colored: 7 },
      allowedImageIds: new Set(["classic", "rated", "colored"]),
    })).toEqual({
      ratings: { rated: 4, classic: 1 },
      colorLabels: { colored: 7 },
    });
  });
});

describe("customer Bridge folder browser", () => {
  const images = [
    { id: "root", relative_path: "cover.jpg" },
    { id: "s1-a", relative_path: "Scene 1/A.jpg" },
    { id: "s1-detail", relative_path: "Scene 1/Detail/B.jpg" },
    { id: "s2-a", relative_path: "Scene 2/A.jpg" },
    { id: "s1-c", relative_path: "Scene 1/C.jpg" },
  ];

  it("preserves the uploaded folder hierarchy, names, order, and subtree counts", () => {
    const root = customerBridgeFolderView(images, "");
    expect(root.images.map((image) => image.id)).toEqual(["root"]);
    expect(root.folders).toEqual([
      { path: "Scene 1", name: "Scene 1", directCount: 2, totalCount: 3, representativeImageId: "s1-a" },
      { path: "Scene 2", name: "Scene 2", directCount: 1, totalCount: 1, representativeImageId: "s2-a" },
    ]);

    const scene = customerBridgeFolderView(images, "Scene 1");
    expect(scene.images.map((image) => image.id)).toEqual(["s1-a", "s1-c"]);
    expect(scene.folders).toEqual([
      { path: "Scene 1/Detail", name: "Detail", directCount: 1, totalCount: 1, representativeImageId: "s1-detail" },
    ]);
    expect(scene.breadcrumbs).toEqual([{ name: "Scene 1", path: "Scene 1" }]);
  });

  it("normalizes separators without lowercasing display folder names", () => {
    const view = customerBridgeFolderView(images, "Scene 1\\Detail");
    expect(view.currentPath).toBe("Scene 1/Detail");
    expect(view.images.map((image) => image.id)).toEqual(["s1-detail"]);
  });

  it("builds the left folder hierarchy without rendering folder cards in the photo grid", () => {
    expect(customerBridgeFolderTree(images)).toEqual([
      { path: "Scene 1", name: "Scene 1", depth: 0, directCount: 2, totalCount: 3, representativeImageId: "s1-a" },
      { path: "Scene 1/Detail", name: "Detail", depth: 1, directCount: 1, totalCount: 1, representativeImageId: "s1-detail" },
      { path: "Scene 2", name: "Scene 2", depth: 0, directCount: 1, totalCount: 1, representativeImageId: "s2-a" },
    ]);
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
