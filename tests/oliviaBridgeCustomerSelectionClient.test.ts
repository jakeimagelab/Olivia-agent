import { afterEach, describe, expect, it, vi } from "vitest";

import {
  loadOliviaBridgeGallerySelection,
  loadOliviaBridgeSelectionSources,
  loadOliviaBridgeSharedProjectSelection,
} from "@/components/olivia-bridge/oliviaBridgeCustomerSelectionClient";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("Olivia Bridge customer selection client", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("loads galleries and keeps only shared person-select projects", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url === "/api/select-galleries") {
        return jsonResponse({ ok: true, galleries: [{ id: "gallery-1", title: "갤러리", status: "open" }] });
      }
      return jsonResponse({
        ok: true,
        events: [
          { id: "shared-1", title: "공동", people_count: 0, submitted_count: 1, access_mode: "project_shared" },
          { id: "person-1", title: "개인", people_count: 1, submitted_count: 1, access_mode: "individual" },
        ],
      });
    }));

    await expect(loadOliviaBridgeSelectionSources()).resolves.toMatchObject({
      galleries: [{ id: "gallery-1" }],
      sharedProjects: [{ id: "shared-1" }],
    });
  });

  it("matches a submitted gallery selection and preserves folder linkage", async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (init?.method === "PATCH") return jsonResponse({ ok: true });
      if (url === "/api/select-galleries/gallery-1") {
        return jsonResponse({
          ok: true,
          gallery: { id: "gallery-1", title: "고객 셀렉", status: "submitted" },
          images: [{ id: "image-1", original_file_name: "AK_0001.JPG", relative_path: "C1/AK_0001.JPG" }],
          selection: {
            items: [{ image_id: "image-1", file_name: "AK_0001.JPG", customer_rating: 5, memo: "밝게" }],
          },
        });
      }
      return jsonResponse({ ok: false }, 404);
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await loadOliviaBridgeGallerySelection({
      gallery: { id: "gallery-1", title: "고객 셀렉", status: "submitted" },
      bridgeFiles: [{ id: "bridge-1", name: "AK_0001.JPG", relativeDirectory: "C1" }],
      bridgeLink: { bridge_source: "local", bridge_folder_display_path: "촬영 폴더" },
    });

    expect(result.submittedCount).toBe(1);
    expect(result.match.matchedBridgeIds).toEqual(new Set(["bridge-1"]));
    expect(result.match.ratingsByBridgeId).toEqual({ "bridge-1": 5 });
    expect(result.match.notesByBridgeId).toEqual({ "bridge-1": "밝게" });
    expect(fetchMock).toHaveBeenCalledWith("/api/select-galleries/gallery-1", expect.objectContaining({
      method: "PATCH",
      body: JSON.stringify({ bridge_source: "local", bridge_folder_display_path: "촬영 폴더" }),
    }));
  });

  it("loads a submitted shared selection and its quality snapshot", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.endsWith("/quality")) return jsonResponse({ ok: true, results: [], job: { status: "complete" } });
      return jsonResponse({
        ok: true,
        event: { id: "shared-1", title: "공동 셀렉", status: "open" },
        shared: {
          images: [{ id: "image-1", original_file_name: "AK_0001.JPG", relative_path: "C1/AK_0001.JPG" }],
          selection: {
            submitted_at: "2026-11-14T00:00:00.000Z",
            items: [{
              image_id: "image-1",
              customer_rating: 3,
              memo: "피부 보정",
              image: { original_file_name: "AK_0001.JPG", source_rel_path: "C1/AK_0001.JPG" },
            }],
          },
        },
      });
    }));

    const imported = await loadOliviaBridgeSharedProjectSelection({
      project: { id: "shared-1", title: "공동 셀렉", people_count: 0, submitted_count: 1, access_mode: "project_shared" },
      bridgeFiles: [{ id: "bridge-1", name: "AK_0001.JPG", relativeDirectory: "C1" }],
    });

    expect(imported.qualityResponseOk).toBe(true);
    expect(imported.quality.job).toEqual({ status: "complete" });
    expect(imported.result.match.matchedBridgeIds).toEqual(new Set(["bridge-1"]));
    expect(imported.result.personSelectEventId).toBe("shared-1");
  });
});
