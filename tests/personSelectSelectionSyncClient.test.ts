import { afterEach, describe, expect, it, vi } from "vitest";
import {
  readSelectionJsonResponse,
  sendSelectionSyncBatch,
} from "../lib/person-select/selectionSyncClient";

describe("selection sync client", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("빈 응답을 JSON 예외 없이 null로 읽는다", async () => {
    const response = new Response("", { status: 200 });
    await expect(readSelectionJsonResponse(response)).resolves.toBeNull();
  });

  it("정상 응답에서 지정한 snapshot을 반환한다", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      ok: true,
      snapshot: { items: [], updatedAt: null },
    }), { status: 200, headers: { "Content-Type": "application/json" } })));

    const result = await sendSelectionSyncBatch<{ items: unknown[] }>({
      endpoint: "/api/pick/example/choices/batch",
      clientId: "olivia_test_device",
      diffs: [],
      responseKey: "snapshot",
    });
    expect(result.items).toEqual([]);
  });

  it("빈 504 응답은 자동 재시도 가능한 저장 오류로 바꾼다", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 504 })));

    const request = sendSelectionSyncBatch({
      endpoint: "/api/pick/shared/example/draft",
      clientId: "olivia_test_device",
      diffs: [],
      responseKey: "draft",
    });
    await expect(request).rejects.toMatchObject({
      name: "SelectionSyncRequestError",
      options: { retryable: true },
    });
  });

  it("권한 오류는 자동 재시도하지 않는다", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ ok: false, error: "권한 없음" }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    })));

    const request = sendSelectionSyncBatch({
      endpoint: "/api/pick/shared/example/draft",
      clientId: "olivia_test_device",
      diffs: [],
      responseKey: "draft",
    });
    await expect(request).rejects.toMatchObject({
      message: "권한 없음",
      options: { retryable: false },
    });
  });
});
