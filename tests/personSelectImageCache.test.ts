import { beforeEach, describe, expect, it } from "vitest";

import {
  clearPersonSelectImageCacheEntries,
  PERSON_SELECT_IMAGE_CACHE_MAX_AGE_MS,
  readPersonSelectImageCache,
  resetPersonSelectImageCacheForTests,
  writePersonSelectImageCache,
} from "@/components/person-select/personSelectImageCache";
import type { PersonSelectImageData } from "@/components/person-select/usePersonChoiceSync";

function image(id: string): PersonSelectImageData {
  return {
    id,
    original_file_name: `${id}.JPG`,
    thumb_url: `/thumb/${id}`,
    preview_url: "",
    width: null,
    height: null,
  };
}

describe("person select image cache", () => {
  beforeEach(() => resetPersonSelectImageCacheForTests());

  it("isolates cached pages by project and category", () => {
    writePersonSelectImageCache("project-a", "profile", {
      images: [image("a-profile")],
      fetchedAt: 1_000,
      nextCursor: "cursor-a",
    });
    writePersonSelectImageCache("project-a", "group", {
      images: [image("a-group")],
      fetchedAt: 1_000,
      nextCursor: null,
    });

    expect(readPersonSelectImageCache("project-a", "profile", 1_001)?.images[0]?.id)
      .toBe("a-profile");
    expect(readPersonSelectImageCache("project-a", "group", 1_001)?.images[0]?.id)
      .toBe("a-group");
    expect(readPersonSelectImageCache("project-b", "profile", 1_001)).toBeNull();
  });

  it("expires old pages instead of showing stale signed URLs", () => {
    writePersonSelectImageCache("project-a", "profile", {
      images: [image("photo-1")],
      fetchedAt: 10_000,
      nextCursor: null,
    });

    expect(readPersonSelectImageCache(
      "project-a",
      "profile",
      10_000 + PERSON_SELECT_IMAGE_CACHE_MAX_AGE_MS - 1,
    )).not.toBeNull();
    expect(readPersonSelectImageCache(
      "project-a",
      "profile",
      10_000 + PERSON_SELECT_IMAGE_CACHE_MAX_AGE_MS,
    )).toBeNull();
  });

  it("clears every category for one project without clearing another project", () => {
    for (const [slug, category] of [["project-a", "profile"], ["project-a", "group"], ["project-b", "profile"]] as const) {
      writePersonSelectImageCache(slug, category, {
        images: [image(`${slug}-${category}`)],
        fetchedAt: 1_000,
        nextCursor: null,
      });
    }

    clearPersonSelectImageCacheEntries("project-a");

    expect(readPersonSelectImageCache("project-a", "profile", 1_001)).toBeNull();
    expect(readPersonSelectImageCache("project-a", "group", 1_001)).toBeNull();
    expect(readPersonSelectImageCache("project-b", "profile", 1_001)).not.toBeNull();
  });
});
