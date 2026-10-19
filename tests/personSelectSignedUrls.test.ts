import { beforeEach, describe, expect, it, vi } from "vitest";

const { createSignedUrlsMock, getSupabaseAdminMock, storageFromMock } = vi.hoisted(() => ({
  createSignedUrlsMock: vi.fn(),
  getSupabaseAdminMock: vi.fn(),
  storageFromMock: vi.fn(),
}));

vi.mock("@/lib/supabase", () => ({
  getSupabaseAdmin: getSupabaseAdminMock,
}));

import { PERSON_SELECT_BUCKET, signedImageUrls } from "@/lib/person-select/server";

describe("person select signed image urls", () => {
  beforeEach(() => {
    createSignedUrlsMock.mockReset();
    storageFromMock.mockReset();
    getSupabaseAdminMock.mockReset();
    createSignedUrlsMock.mockResolvedValue({
      data: [{ signedUrl: "signed-thumb" }, { signedUrl: "signed-preview" }],
      error: null,
    });
    storageFromMock.mockReturnValue({ createSignedUrls: createSignedUrlsMock });
    getSupabaseAdminMock.mockReturnValue({ storage: { from: storageFromMock } });
  });

  it("signs every unique thumbnail and preview path in one storage call", async () => {
    const result = await signedImageUrls(["event/a_thumb.jpg", "event/a_preview.jpg", "event/a_thumb.jpg"], 600);

    expect(storageFromMock).toHaveBeenCalledOnce();
    expect(storageFromMock).toHaveBeenCalledWith(PERSON_SELECT_BUCKET);
    expect(createSignedUrlsMock).toHaveBeenCalledOnce();
    expect(createSignedUrlsMock).toHaveBeenCalledWith(["event/a_thumb.jpg", "event/a_preview.jpg"], 600);
    expect(result).toEqual(new Map([
      ["event/a_thumb.jpg", "signed-thumb"],
      ["event/a_preview.jpg", "signed-preview"],
    ]));
  });

  it("does not call storage for an empty path list", async () => {
    await expect(signedImageUrls([], 600)).resolves.toEqual(new Map());
    expect(createSignedUrlsMock).not.toHaveBeenCalled();
  });
});
