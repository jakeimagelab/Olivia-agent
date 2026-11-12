import { describe, expect, it } from "vitest";
import {
  completedPersonSelectClientImagePageState,
  mergePersonSelectClientImages,
  personSelectClientImagePageUrl,
  personSelectClientImageQueryKey,
} from "@/lib/person-select/imagePageClient";
import type { CustomerBridgeImage } from "@/lib/select-gallery/customerBridgeTypes";

function image(id: string, sortOrder: number): CustomerBridgeImage {
  return { id, original_file_name: `${id}.JPG`, image_url: "", sort_order: sortOrder };
}

describe("person selection image page client", () => {
  it("deduplicates overlapping pages and preserves global photo order", () => {
    const first = Array.from({ length: 1_300 }, (_, index) => image(`id-${index}`, index));
    const second = Array.from({ length: 1_300 }, (_, index) => image(`id-${index + 1_200}`, index + 1_200));
    const merged = mergePersonSelectClientImages(first, second);
    expect(merged).toHaveLength(2_500);
    expect(merged[0].id).toBe("id-0");
    expect(merged.at(-1)?.id).toBe("id-2499");
  });

  it("keeps folder and search cursors in separate query keys", () => {
    expect(personSelectClientImageQueryKey({ location: "folder", folderPath: "C1", search: "1745" }))
      .not.toBe(personSelectClientImageQueryKey({ location: "folder", folderPath: "C2", search: "1745" }));
    expect(personSelectClientImageQueryKey({ location: "all", search: "1745" }))
      .not.toBe(personSelectClientImageQueryKey({ location: "all", search: "1802" }));
  });

  it("builds a bounded cursor request without leaking empty query fields", () => {
    expect(personSelectClientImagePageUrl({
      baseUrl: "/api/pick/shared/token/images",
      query: { location: "folder", folderPath: " C1/인물 ", search: " 1745 1802 " },
      cursor: "next-page",
      limit: 120,
    })).toBe("/api/pick/shared/token/images?location=folder&limit=120&folder=C1%2F%EC%9D%B8%EB%AC%BC&search=1745+1802&cursor=next-page");
  });

  it("turns a bootstrap page into a ready query state", () => {
    expect(completedPersonSelectClientImagePageState({ items: [], nextCursor: "cursor", totalCount: 1_645 }))
      .toEqual({ initialized: true, loading: false, nextCursor: "cursor", totalCount: 1_645, error: "" });
  });
});
