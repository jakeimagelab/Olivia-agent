import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  signedImageUrls: vi.fn(async (paths: string[] = []) => new Map(paths.map((path) => [path, `signed:${path}`]))),
}));

vi.mock("@/lib/person-select/server", () => ({ signedImageUrls: mocks.signedImageUrls }));

import {
  getSharedPersonSelectImageUrls,
  getSharedPersonSelectImages,
  SHARED_PERSON_SELECT_MEDIA_BATCH_LIMIT,
} from "@/lib/person-select/sharedPublic";

type ImageRow = {
  id: string;
  original_file_name: string;
  source_rel_path: string;
  thumb_path: string;
  preview_path: string;
  width: number;
  height: number;
  sort_order: number;
};

function fakeImageDb(rows: ImageRow[]): SupabaseClient {
  return {
    from() {
      let requestedIds: string[] | null = null;
      const result = () => ({
        data: requestedIds ? rows.filter((row) => requestedIds?.includes(row.id)) : rows,
        error: null,
      });
      const builder = {
        select() { return builder; },
        eq() { return builder; },
        order() { return builder; },
        in(_column: string, ids: string[]) { requestedIds = ids; return builder; },
        range(from: number, to: number) {
          return Promise.resolve({ data: rows.slice(from, to + 1), error: null });
        },
        then<TResult1 = unknown, TResult2 = never>(
          onfulfilled?: ((value: ReturnType<typeof result>) => TResult1 | PromiseLike<TResult1>) | null,
          onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
        ) {
          return Promise.resolve(result()).then(onfulfilled, onrejected);
        },
      };
      return builder;
    },
  } as unknown as SupabaseClient;
}

const rows: ImageRow[] = [
  { id: "image-a", original_file_name: "A.JPG", source_rel_path: "C1/A.JPG", thumb_path: "thumb/a.jpg", preview_path: "preview/a.jpg", width: 480, height: 720, sort_order: 1 },
  { id: "image-b", original_file_name: "B.JPG", source_rel_path: "C1/B.JPG", thumb_path: "thumb/b.jpg", preview_path: "preview/b.jpg", width: 720, height: 480, sort_order: 2 },
];

describe("person-select visible media batches", () => {
  beforeEach(() => mocks.signedImageUrls.mockClear());

  it("keeps the initial large-project response metadata-only", async () => {
    const images = await getSharedPersonSelectImages(fakeImageDb(rows), "event-a");
    expect(images).toEqual(rows.map((row) => expect.objectContaining({
      id: row.id,
      thumbnail_url: "",
      image_url: "",
    })));
    expect(mocks.signedImageUrls).not.toHaveBeenCalled();
  });

  it("signs only requested project-owned images", async () => {
    const urls = await getSharedPersonSelectImageUrls(fakeImageDb(rows), "event-a", ["image-b"]);
    expect(urls).toEqual({
      "image-b": { thumbnail_url: "signed:thumb/b.jpg", image_url: "signed:preview/b.jpg" },
    });
    expect(mocks.signedImageUrls).toHaveBeenCalledWith(["thumb/b.jpg", "preview/b.jpg"], 3_600);
  });

  it("rejects oversized batches and image IDs outside the project", async () => {
    const tooMany = Array.from({ length: SHARED_PERSON_SELECT_MEDIA_BATCH_LIMIT + 1 }, (_, index) => `image-${index}`);
    await expect(getSharedPersonSelectImageUrls(fakeImageDb(rows), "event-a", tooMany)).rejects.toThrow("240장");
    await expect(getSharedPersonSelectImageUrls(fakeImageDb(rows), "event-a", ["image-a", "other-event-image"])).rejects.toThrow("없는 사진");
  });
});
