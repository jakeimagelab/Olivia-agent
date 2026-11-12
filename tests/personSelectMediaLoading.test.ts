import { describe, expect, it } from "vitest";
import {
  adjacentSelectionMediaIds,
  mergeSelectionMediaUrlCache,
  mergeSelectionMediaUrlRecords,
  SELECTION_MEDIA_URL_CACHE_LIMIT,
  SELECTION_THUMBNAIL_PAGE_SIZE,
} from "@/lib/select-gallery/mediaLoading";
import { mergePersonSelectImagePages, mergePersonSelectPreviewUrls } from "@/components/person-select/usePersonSelectImages";

describe("person select media loading", () => {
  it("limits the first thumbnail page to a small shared batch", () => {
    expect(SELECTION_THUMBNAIL_PAGE_SIZE).toBe(72);
    expect(SELECTION_MEDIA_URL_CACHE_LIMIT).toBeGreaterThan(SELECTION_THUMBNAIL_PAGE_SIZE);
  });

  it("keeps a bounded least-recently-used URL cache", () => {
    let cache = mergeSelectionMediaUrlCache({ records: {}, order: [] }, {
      a: { thumbnail_url: "thumb-a" },
      b: { thumbnail_url: "thumb-b" },
    }, 2);
    cache = mergeSelectionMediaUrlCache(cache, { a: { image_url: "preview-a" } }, 2);
    cache = mergeSelectionMediaUrlCache(cache, { c: { thumbnail_url: "thumb-c" } }, 2);

    expect(cache.order).toEqual(["a", "c"]);
    expect(cache.records).toEqual({
      a: { thumbnail_url: "thumb-a", image_url: "preview-a" },
      c: { thumbnail_url: "thumb-c" },
    });
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

  it("progressively merges personal image pages without losing selected previews", () => {
    const merged = mergePersonSelectImagePages([{
      id: "selected-late",
      original_file_name: "B.JPG",
      thumb_url: "selected-thumb",
      preview_url: "selected-preview",
      width: null,
      height: null,
    }], [{
      id: "first",
      original_file_name: "A.JPG",
      thumb_url: "first-thumb",
      preview_url: "",
      width: 1200,
      height: 800,
      sort_order: 1,
    }, {
      id: "selected-late",
      original_file_name: "B.JPG",
      thumb_url: "fresh-thumb",
      preview_url: "",
      width: 800,
      height: 1200,
      sort_order: 80,
    }]);
    expect(merged.map((image) => image.id)).toEqual(["first", "selected-late"]);
    expect(merged[1]).toMatchObject({
      thumb_url: "fresh-thumb",
      preview_url: "selected-preview",
      sort_order: 80,
    });
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
