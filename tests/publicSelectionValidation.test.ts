import { describe, expect, it, vi } from "vitest";

import {
  PublicSelectionRequestError,
  getOwnedSelectionImageIds,
  parsePublicSelectionDraft,
  parsePublicSelectionSubmit,
  publicSelectionErrorResponse,
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
      items: [{ imageId: "img-a", rating: 5, colorLabel: null, memo: "피부 정리" }],
    }, allowed)).toEqual({
      revision: 2,
      requestKey: "request_12345678",
      customerMemo: "전체 메모",
      items: [{ imageId: "img-a", rating: 5, colorLabel: null, memo: "피부 정리" }],
    });
  });

  it("rejects another gallery image, duplicate IDs and invalid ratings", () => {
    expect(() => parsePublicSelectionDraft({ revision: 0, items: [{ imageId: "other" }] }, allowed)).toThrow("없는 사진");
    expect(() => parsePublicSelectionDraft({ revision: 0, items: [{ imageId: "img-a" }, { imageId: "img-a" }] }, allowed)).toThrow("두 번");
    expect(() => parsePublicSelectionDraft({ revision: 0, items: [{ imageId: "img-a", rating: 6 }] }, allowed)).toThrow("1점부터 5점");
    expect(() => parsePublicSelectionDraft({ revision: 0, items: [{ imageId: "img-a", colorLabel: 5 }] }, allowed)).toThrow("6번부터 9번");
  });

  it("accepts color-only customer selections", () => {
    expect(parsePublicSelectionDraft({ revision: 1, items: [{ imageId: "img-b", colorLabel: 9, memo: "후보" }] }, allowed)).toEqual({
      revision: 1,
      customerMemo: "",
      items: [{ imageId: "img-b", rating: null, colorLabel: 9, memo: "후보" }],
    });
  });

  it("requires at least one item only for final submit", () => {
    expect(parsePublicSelectionDraft({ revision: 0, items: [] }, allowed).items).toEqual([]);
    expect(() => parsePublicSelectionSubmit({ revision: 0, requestKey: "request_12345678", items: [] }, allowed)).toThrow("한 장 이상");
  });

  it("checks ownership for only the UUIDs requested in the selection body", async () => {
    const ownedId = "11111111-1111-4111-8111-111111111111";
    const unownedId = "22222222-2222-4222-8222-222222222222";
    const lookup = vi.fn(async (_column: string, ids: string[]) => ({
      data: ids.includes(ownedId) ? [{ id: ownedId }] : [],
      error: null,
    }));
    const eq = vi.fn(() => ({ in: lookup }));
    const select = vi.fn(() => ({ eq }));
    const from = vi.fn(() => ({ select }));

    const owned = await getOwnedSelectionImageIds({ from } as never, {
      table: "person_select_images",
      ownerColumn: "event_id",
      ownerId: "event-1",
    }, {
      items: [
        { imageId: ownedId },
        { imageId: unownedId },
        { imageId: ownedId },
        { imageId: "not-a-uuid" },
      ],
    });

    expect(from).toHaveBeenCalledWith("person_select_images");
    expect(eq).toHaveBeenCalledWith("event_id", "event-1");
    expect(lookup).toHaveBeenCalledWith("id", [ownedId, unownedId]);
    expect(owned).toEqual(new Set([ownedId]));
  });

  it("chunks large ownership lookups instead of scanning the project", async () => {
    const requestedIds = Array.from({ length: 201 }, (_, index) =>
      `00000000-0000-4000-8000-${index.toString(16).padStart(12, "0")}`,
    );
    const lookup = vi.fn(async (_column: string, ids: string[]) => ({
      data: ids.map((id) => ({ id })),
      error: null,
    }));
    const query = { in: lookup };
    const db = {
      from: vi.fn(() => ({ select: () => ({ eq: () => query }) })),
    };

    const owned = await getOwnedSelectionImageIds(db as never, {
      table: "person_select_images",
      ownerColumn: "event_id",
      ownerId: "event-1",
    }, { items: requestedIds.map((imageId) => ({ imageId })) });

    expect(lookup).toHaveBeenCalledTimes(2);
    expect(lookup.mock.calls.map((call) => call[1].length)).toEqual([200, 1]);
    expect(owned.size).toBe(201);
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

  it("keeps expected validation messages but hides unexpected database details", async () => {
    const validation = publicSelectionErrorResponse(new PublicSelectionRequestError("유효하지 않은 공유 링크입니다.", 404));
    expect(validation.status).toBe(404);
    expect(await validation.json()).toMatchObject({ error: "유효하지 않은 공유 링크입니다." });

    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const internal = publicSelectionErrorResponse(new Error("function digest(text, unknown) does not exist"));
    expect(internal.status).toBe(500);
    expect(await internal.json()).toEqual({
      ok: false,
      code: "PUBLIC_SELECTION_UNAVAILABLE",
      error: "사진선택 서버 연결을 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.",
    });
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });
});
