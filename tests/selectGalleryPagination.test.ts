import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getGalleryImages } from "@/lib/selectGallery";

function pagedClient(total: number) {
  const calls: Array<[number, number]> = [];
  const rows = Array.from({ length: total }, (_, index) => ({
    id: `image-${index}`,
    gallery_id: "gallery",
    original_file_name: `IMG_${index}.JPG`,
    basename: `IMG_${index}`,
    extension: "jpg",
    image_url: `https://example.test/${index}.jpg`,
    sort_order: index,
    expires_at: "2099-01-01T00:00:00.000Z",
    created_at: "2026-11-06T00:00:00.000Z",
  }));
  const query = {
    select() { return this; },
    eq() { return this; },
    order() { return this; },
    async range(from: number, to: number) {
      calls.push([from, to]);
      return { data: rows.slice(from, to + 1), error: null };
    },
  };
  const db = { from: () => query } as unknown as SupabaseClient;
  return { db, calls };
}

describe("getGalleryImages pagination", () => {
  it("loads every image beyond the Supabase 1000-row response limit", async () => {
    const { db, calls } = pagedClient(2_805);
    const images = await getGalleryImages(db, "gallery");
    expect(images).toHaveLength(2_805);
    expect(images.at(-1)?.id).toBe("image-2804");
    expect(calls).toEqual([[0, 999], [1000, 1999], [2000, 2999]]);
  });
});
