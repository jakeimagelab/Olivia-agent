import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTemporaryDocumentShareToken, verifyTemporaryDocumentShareToken } from "@/lib/olivia/documents/temporaryDocumentShares";

describe("temporary document preview tokens", () => {
  beforeEach(() => {
    process.env.TEMPORARY_DOCUMENT_SHARE_SECRET = "test-only-signing-secret";
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-11T10:00:00.000Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
    delete process.env.TEMPORARY_DOCUMENT_SHARE_SECRET;
  });

  it("carries the document id and remains valid for seven days", () => {
    const share = createTemporaryDocumentShareToken("temporary-1");
    expect(verifyTemporaryDocumentShareToken(share.token)?.temporaryDocumentId).toBe("temporary-1");
    expect(share.expiresAt).toBe("2026-09-18T10:00:00.000Z");
  });

  it("rejects tampered and expired tokens", () => {
    const share = createTemporaryDocumentShareToken("temporary-1");
    expect(verifyTemporaryDocumentShareToken(`${share.token}x`)).toBeNull();
    vi.setSystemTime(new Date("2026-09-18T10:00:00.001Z"));
    expect(verifyTemporaryDocumentShareToken(share.token)).toBeNull();
  });
});
