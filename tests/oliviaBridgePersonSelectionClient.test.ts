import { afterEach, describe, expect, it, vi } from "vitest";

import {
  loadOliviaBridgePersonSelection,
  loadOliviaBridgePersonSelectionEvents,
} from "@/components/olivia-bridge/oliviaBridgePersonSelectionClient";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("Olivia Bridge person selection client", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("loads person selection events", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({
      ok: true,
      events: [{ id: "event-1", title: "프로필", people_count: 2, submitted_count: 1 }],
    })));

    await expect(loadOliviaBridgePersonSelectionEvents()).resolves.toMatchObject([
      { id: "event-1", title: "프로필" },
    ]);
  });

  it("filters invalid names and matches submitted files to Bridge files", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({
      ok: true,
      eventTitle: "푸른안과",
      fileNames: ["AK_0001.JPG", 123, null, "missing.jpg"],
    })));

    const result = await loadOliviaBridgePersonSelection({
      event: { id: "event-1", title: "프로필", people_count: 2, submitted_count: 1 },
      bridgeFileNames: ["AK_0001.JPG", "AK_0002.JPG"],
    });

    expect(result.eventTitle).toBe("푸른안과");
    expect(result.fileNames).toEqual(["AK_0001.JPG", "missing.jpg"]);
    expect(result.missing).toEqual(["missing.jpg"]);
  });

  it("surfaces the API error without changing its message", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ ok: false, error: "선택본 없음" }, 404)));

    await expect(loadOliviaBridgePersonSelection({
      event: { id: "event-1", title: "프로필", people_count: 2, submitted_count: 0 },
      bridgeFileNames: [],
    })).rejects.toThrow("선택본 없음");
  });
});
