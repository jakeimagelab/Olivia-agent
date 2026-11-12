import { describe, expect, it } from "vitest";
import { adjacentSelectionMediaIds, mergeSelectionMediaUrlRecords, SELECTION_THUMBNAIL_PAGE_SIZE } from "@/lib/select-gallery/mediaLoading";
import { mergePersonSelectPreviewUrls } from "@/components/person-select/usePersonSelectImages";

describe("person select media loading", () => {
  it("limits the first thumbnail page to a small shared batch", () => {
    expect(SELECTION_THUMBNAIL_PAGE_SIZE).toBe(72);
  });

  it("merges a preview URL without dropping an existing thumbnail URL", () => {
    expect(mergeSelectionMediaUrlRecords(
      { image: { thumbnail_url: "thumb" } },
      { image: { image_url: "preview" } },
    )).toEqual({ image: { thumbnail_url: "thumb", image_url: "preview" } });
  });

  it("adds a personal preview without replacing its thumbnail metadata", () => {
    expect(mergePersonSelectPreviewUrls([{
      id: "image-a",
      original_file_name: "A.JPG",
      thumb_url: "thumb-a",
      preview_url: "",
      width: 1200,
      height: 800,
    }], [{ id: "image-a", preview_url: "preview-a" }])).toEqual([{
      id: "image-a",
      original_file_name: "A.JPG",
      thumb_url: "thumb-a",
      preview_url: "preview-a",
      width: 1200,
      height: 800,
    }]);
  });

  it("returns only the active preview neighborhood", () => {
    const images = Array.from({ length: 10 }, (_, index) => ({ id: `image-${index}` }));
    expect(adjacentSelectionMediaIds(images, "image-5", 2)).toEqual([
      "image-3",
      "image-4",
      "image-5",
      "image-6",
      "image-7",
    ]);
    expect(adjacentSelectionMediaIds(images, "image-0", 2)).toEqual(["image-0", "image-1", "image-2"]);
  });
});
