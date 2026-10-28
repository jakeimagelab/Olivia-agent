import { describe, expect, it, vi } from "vitest";
import { loadRemoteBridgeThumbnails } from "@/lib/photo-bridge/remoteThumbnails";

const dataUrl = "data:image/jpeg;base64,/9j/2Q==";

function thumb(index: number) {
  return {
    relativePath: `IMG_${String(index).padStart(4, "0")}.JPG`,
    name: `IMG_${String(index).padStart(4, "0")}.JPG`,
    size: 1000 + index,
    lastModified: 1_700_000_000_000 + index,
    dataUrl,
  };
}

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

describe("remote Bridge thumbnails", () => {
  it("loads more than 400 thumbnails in verified pages", async () => {
    let created = 0;
    const posts: Array<Record<string, unknown>> = [];
    const fetcher = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (init?.method === "POST") {
        const body = JSON.parse(String(init.body)) as { payload: Record<string, unknown> };
        posts.push(body.payload);
        created += 1;
        return response({ ok: true, job: { id: `job-${created}` } });
      }
      const page = url.includes("job-1")
        ? Array.from({ length: 400 }, (_, index) => thumb(index))
        : [thumb(400)];
      return response({
        ok: true,
        job: {
          id: created === 1 ? "job-1" : "job-2",
          action: "PHOTO_THUMBS",
          status: "COMPLETED",
          result: { ok: true, folder: "shoot/JPG전체", total: 401, thumbs: page },
        },
      });
    });

    const result = await loadRemoteBridgeThumbnails("shoot/JPG전체", {
      fetcher: fetcher as typeof fetch,
      pollIntervalMs: 0,
    });

    expect(result.total).toBe(401);
    expect(result.thumbs).toHaveLength(401);
    expect(posts).toEqual([
      { remote_path: "shoot/JPG전체", max_count: 400, offset: 0 },
      { remote_path: "shoot/JPG전체", max_count: 400, offset: 400 },
    ]);
  });

  it("fails when a completed page stops before the reported total", async () => {
    let created = 0;
    const fetcher = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      if (init?.method === "POST") {
        created += 1;
        return response({ ok: true, job: { id: `job-${created}` } });
      }
      return response({
        ok: true,
        job: {
          id: `job-${created}`,
          action: "PHOTO_THUMBS",
          status: "COMPLETED",
          result: {
            ok: true,
            folder: "shoot/JPG전체",
            total: 401,
            thumbs: created === 1 ? Array.from({ length: 400 }, (_, index) => thumb(index)) : [],
          },
        },
      });
    });

    await expect(loadRemoteBridgeThumbnails("shoot/JPG전체", {
      fetcher: fetcher as typeof fetch,
      pollIntervalMs: 0,
    })).rejects.toThrow("400/401장만 받았습니다");
  });
});
