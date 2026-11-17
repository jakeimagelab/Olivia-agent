import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getBucket: vi.fn(),
  createBucket: vi.fn(),
  updateBucket: vi.fn(),
}));

vi.mock("@/lib/supabase", () => ({
  getSupabaseAdmin: () => ({ storage: mocks }),
}));

import { ensurePersonSelectBucket } from "@/lib/person-select/server";

describe("person-select storage bucket", () => {
  beforeEach(() => {
    mocks.getBucket.mockReset();
    mocks.createBucket.mockReset();
    mocks.updateBucket.mockReset();
    mocks.createBucket.mockResolvedValue({ error: null });
    mocks.updateBucket.mockResolvedValue({ error: null });
  });

  it("preserves the existing file-size limit while adding the required MIME type", async () => {
    mocks.getBucket.mockResolvedValue({
      data: {
        public: false,
        file_size_limit: 10 * 1024 * 1024,
        allowed_mime_types: ["image/jpeg"],
      },
    });

    await ensurePersonSelectBucket();

    expect(mocks.updateBucket).toHaveBeenCalledWith("person-select", {
      public: false,
      fileSizeLimit: 10 * 1024 * 1024,
      allowedMimeTypes: ["image/jpeg", "application/json"],
    });
  });

  it("does not force a new bucket above the project global file-size limit", async () => {
    mocks.getBucket.mockResolvedValue({ data: null });

    await ensurePersonSelectBucket();

    expect(mocks.createBucket).toHaveBeenCalledWith("person-select", {
      public: false,
      fileSizeLimit: null,
      allowedMimeTypes: ["image/jpeg", "application/json"],
    });
  });
});
