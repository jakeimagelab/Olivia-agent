import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  remove: vi.fn(),
}));

vi.mock("@/lib/passkey", () => ({ isAdminSession: () => true }));
vi.mock("@/lib/supabase", () => ({
  getSupabaseAdmin: () => ({
    from: mocks.from,
    storage: { from: () => ({ remove: mocks.remove }) },
  }),
}));

import { DELETE } from "@/app/api/person-select/[eventId]/route";

const context = { params: Promise.resolve({ eventId: "event-1" }) };

function request(confirmTitle: string) {
  return new NextRequest("http://localhost/api/person-select/event-1", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ confirmTitle }),
  });
}

function eventTable() {
  return {
    select: vi.fn(() => ({
      eq: vi.fn(() => ({
        maybeSingle: vi.fn(async () => ({ data: { id: "event-1", title: "푸른안과(프로필)" }, error: null })),
      })),
    })),
    delete: vi.fn(() => ({
      eq: vi.fn(() => ({
        eq: vi.fn(() => ({
          select: vi.fn(() => ({
            maybeSingle: vi.fn(async () => ({ data: { id: "event-1" }, error: null })),
          })),
        })),
      })),
    })),
  };
}

function uploadJobs(rows: Array<{ id: string; status: string }> = []) {
  return {
    select: vi.fn(() => ({
      eq: vi.fn(() => ({
        in: vi.fn(() => ({
          limit: vi.fn(async () => ({ data: rows, error: null })),
        })),
      })),
    })),
  };
}

function imagesTable() {
  const query = {
    order: vi.fn(),
    range: vi.fn(async () => ({
      data: [
        { thumb_path: "event-1/a_thumb.jpg", preview_path: "event-1/a_preview.jpg" },
        { thumb_path: "event-1/b_thumb.jpg", preview_path: "event-1/b_preview.jpg" },
      ],
      error: null,
    })),
  };
  query.order.mockImplementation(() => query);
  return { select: vi.fn(() => ({ eq: vi.fn(() => query) })) };
}

describe("person-select project DELETE", () => {
  beforeEach(() => {
    mocks.from.mockReset();
    mocks.remove.mockReset();
    mocks.remove.mockResolvedValue({ error: null });
  });

  it("requires the exact project title", async () => {
    const events = eventTable();
    mocks.from.mockImplementation((table: string) => {
      if (table === "person_select_events") return events;
      throw new Error(`unexpected table: ${table}`);
    });

    const response = await DELETE(request("푸른안과"), context);
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ ok: false, error: "프로젝트명이 일치하지 않습니다." });
    expect(events.delete).not.toHaveBeenCalled();
  });

  it("blocks deletion while an upload is active", async () => {
    const events = eventTable();
    mocks.from.mockImplementation((table: string) => {
      if (table === "person_select_events") return events;
      if (table === "person_select_upload_jobs") return uploadJobs([{ id: "job-1", status: "uploading" }]);
      throw new Error(`unexpected table: ${table}`);
    });

    const response = await DELETE(request("푸른안과(프로필)"), context);
    expect(response.status).toBe(409);
    expect((await response.json()).error).toContain("사진 업로드가 진행 중");
    expect(events.delete).not.toHaveBeenCalled();
  });

  it("deletes the project before removing its storage previews", async () => {
    const events = eventTable();
    mocks.from.mockImplementation((table: string) => {
      if (table === "person_select_events") return events;
      if (table === "person_select_upload_jobs") return uploadJobs();
      if (table === "person_select_images") return imagesTable();
      throw new Error(`unexpected table: ${table}`);
    });

    const response = await DELETE(request("푸른안과(프로필)"), context);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, deletedId: "event-1", removedFileCount: 4 });
    expect(events.delete).toHaveBeenCalledTimes(1);
    expect(mocks.remove).toHaveBeenCalledWith([
      "event-1/a_thumb.jpg",
      "event-1/a_preview.jpg",
      "event-1/b_thumb.jpg",
      "event-1/b_preview.jpg",
    ]);
  });
});
