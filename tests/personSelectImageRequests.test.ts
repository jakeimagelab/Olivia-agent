import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  clearPersonSelectImageRequestCache,
  fetchPersonSelectPreviewUrls,
} from "@/components/person-select/personSelectImageRequests";

describe("person select image requests", () => {
  beforeEach(() => clearPersonSelectImageRequestCache("event"));
  afterEach(() => vi.unstubAllGlobals());

  it("reuses overlapping in-flight preview requests by image id", async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = new URL(String(input), "https://olivia.test");
      const imageIds = url.searchParams.getAll("imageId");
      return {
        ok: true,
        json: async () => ({
          images: imageIds.map((id) => ({
            id,
            original_file_name: `${id}.JPG`,
            thumb_url: `thumb-${id}`,
            preview_url: `preview-${id}`,
            width: null,
            height: null,
          })),
        }),
      } as Response;
    });
    vi.stubGlobal("fetch", fetchMock);

    const first = fetchPersonSelectPreviewUrls("event", "profile", ["a", "b"]);
    const second = fetchPersonSelectPreviewUrls("event", "profile", ["b", "c"]);
    const [firstImages, secondImages] = await Promise.all([first, second]);

    expect(firstImages.map((image) => image.id)).toEqual(["a", "b"]);
    expect(secondImages.map((image) => image.id)).toEqual(["b", "c"]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const secondUrl = new URL(String(fetchMock.mock.calls[1][0]), "https://olivia.test");
    expect(secondUrl.searchParams.getAll("imageId")).toEqual(["c"]);
  });

  it("deduplicates the same preview id inside one request", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        images: [{
          id: "a",
          original_file_name: "a.JPG",
          thumb_url: "thumb-a",
          preview_url: "preview-a",
          width: null,
          height: null,
        }],
      }),
    }) as Response);
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchPersonSelectPreviewUrls("event", "profile", ["a", "a", "a"]);

    expect(result.map((image) => image.id)).toEqual(["a"]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
