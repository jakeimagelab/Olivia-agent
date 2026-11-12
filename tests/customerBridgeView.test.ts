import { describe, expect, it } from "vitest";
import { EMPTY_BRIDGE_LABEL_FILTERS } from "@/lib/photo-bridge/labels";
import { buildCustomerBridgePhotoView } from "@/lib/select-gallery/customerBridgeView";
import type { CustomerBridgeImage } from "@/lib/select-gallery/customerBridgeTypes";
import type { PublicPhotoQualityResult } from "@/lib/photo-quality/types";

const images = [
  { id: "a", original_file_name: "_AK_1745.JPG" },
  { id: "b", original_file_name: "_AK_1802.JPG" },
  { id: "c", original_file_name: "_AK_2210.JPG" },
] as CustomerBridgeImage[];

const qualityResults: Record<string, PublicPhotoQualityResult> = {
  a: { imageId: "a", status: "needs_review", flags: ["eyes_closed"], confidence: {}, explanation: {}, reviewStatus: "unreviewed", analyzedAt: null },
  b: { imageId: "b", status: "normal", flags: [], confidence: {}, explanation: {}, reviewStatus: "confirmed_normal", analyzedAt: null },
};

describe("customer Bridge photo view", () => {
  it("combines filename search with the current selection filter", () => {
    const view = buildCustomerBridgePhotoView({
      images,
      filter: "selected",
      filenameSearch: "1745 1802",
      labelFilters: EMPTY_BRIDGE_LABEL_FILTERS,
      selectedIds: new Set(["a", "c"]),
      ratings: { a: 5, c: 3 },
      colorLabels: {},
      qualityResults: {},
    });
    expect(view.visibleImages.map((image) => image.id)).toEqual(["a"]);
    expect(view.selectedInFolder).toBe(2);
  });

  it("uses rating and color filters together", () => {
    const view = buildCustomerBridgePhotoView({
      images,
      filter: "all",
      filenameSearch: "",
      labelFilters: { rating: 5, color: 6 },
      selectedIds: new Set(["a", "b"]),
      ratings: { a: 5, b: 5 },
      colorLabels: { a: 6, b: 7 },
      qualityResults: {},
    });
    expect(view.visibleImages.map((image) => image.id)).toEqual(["a"]);
  });

  it("counts quality states across the whole folder while filtering the visible list", () => {
    const view = buildCustomerBridgePhotoView({
      images,
      filter: "eyes_closed",
      filenameSearch: "",
      labelFilters: EMPTY_BRIDGE_LABEL_FILTERS,
      selectedIds: new Set(),
      ratings: {},
      colorLabels: {},
      qualityResults,
    });
    expect(view.visibleImages.map((image) => image.id)).toEqual(["a"]);
    expect(view.qualityCounts).toMatchObject({ eyes_closed: 1, quality_review: 1, quality_normal: 1 });
  });
});
