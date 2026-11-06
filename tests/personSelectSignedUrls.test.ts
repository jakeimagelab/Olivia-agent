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

  it("splits more than 1000 paths into storage-safe batches", async () => {
    const paths = Array.from({ length: 1_645 }, (_, index) => `event/photo-${index}.jpg`);
    createSignedUrlsMock.mockImplementation(async (batch: string[]) => ({
      data: batch.map((path) => ({ signedUrl: `signed:${path}` })),
      error: null,
    }));

    const result = await signedImageUrls(paths, 600);

    expect(storageFromMock).toHaveBeenCalledOnce();
    expect(createSignedUrlsMock).toHaveBeenCalledTimes(2);
    expect(createSignedUrlsMock.mock.calls[0]?.[0]).toHaveLength(1_000);
    expect(createSignedUrlsMock.mock.calls[1]?.[0]).toHaveLength(645);
    expect(result).toHaveLength(1_645);
    expect(result.get("event/photo-1644.jpg")).toBe("signed:event/photo-1644.jpg");
  });
});
