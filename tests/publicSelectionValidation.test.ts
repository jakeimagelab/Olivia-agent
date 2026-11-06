import { describe, expect, it } from "vitest";

import {
  PublicSelectionRequestError,
  parsePublicSelectionDraft,
  parsePublicSelectionSubmit,
  publicSelectionRateLimitKey,
  readPublicSelectionJson,
} from "@/lib/select-gallery/publicSelection";

const allowed = new Set(["img-a", "img-b"]);

describe("public selection validation", () => {
  it("accepts gallery-owned images and customer-only ratings", () => {
    expect(parsePublicSelectionSubmit({
      revision: 2,
      requestKey: "request_12345678",
      customerMemo: "전체 메모",
      items: [{ imageId: "img-a", rating: 5, memo: "피부 정리" }],
    }, allowed)).toEqual({
      revision: 2,
      requestKey: "request_12345678",
      customerMemo: "전체 메모",
      items: [{ imageId: "img-a", rating: 5, memo: "피부 정리" }],
    });
  });

  it("rejects another gallery image, duplicate IDs and invalid ratings", () => {
    expect(() => parsePublicSelectionDraft({ revision: 0, items: [{ imageId: "other" }] }, allowed)).toThrow("없는 사진");
    expect(() => parsePublicSelectionDraft({ revision: 0, items: [{ imageId: "img-a" }, { imageId: "img-a" }] }, allowed)).toThrow("두 번");
    expect(() => parsePublicSelectionDraft({ revision: 0, items: [{ imageId: "img-a", rating: 6 }] }, allowed)).toThrow("1점부터 5점");
  });

  it("requires at least one item only for final submit", () => {
    expect(parsePublicSelectionDraft({ revision: 0, items: [] }, allowed).items).toEqual([]);
    expect(() => parsePublicSelectionSubmit({ revision: 0, requestKey: "request_12345678", items: [] }, allowed)).toThrow("한 장 이상");
  });

  it("enforces the actual byte size even without content-length", async () => {
    const request = new Request("https://example.test", { method: "POST", body: JSON.stringify({ value: "123456" }) });
    await expect(readPublicSelectionJson(request, 4)).rejects.toMatchObject({ status: 413 } satisfies Partial<PublicSelectionRequestError>);
  });

  it("hashes the token and IP instead of using either raw value", () => {
    const key = publicSelectionRateLimitKey({ token: "secret-token", action: "draft", ip: "192.0.2.1" });
    expect(key).toMatch(/^[a-f0-9]{64}$/);
    expect(key).not.toContain("secret-token");
    expect(key).not.toContain("192.0.2.1");
  });
});
