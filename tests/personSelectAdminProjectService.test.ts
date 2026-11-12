import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  base: vi.fn(),
  failures: vi.fn(),
  shared: vi.fn(),
  deliveries: vi.fn(),
  signedUrls: vi.fn(),
}));

vi.mock("@/lib/person-select/server/adminProjectRepository", () => ({
  loadAdminProjectBase: mocks.base,
  loadOpenSelectionSaveFailures: mocks.failures,
  loadSharedAdminProjectState: mocks.shared,
}));

vi.mock("@/lib/person-select/deliveryServer", () => ({
  loadAdminDeliveryItems: mocks.deliveries,
}));

vi.mock("@/lib/person-select/server", () => ({
  signedImageUrls: mocks.signedUrls,
}));

import { loadPersonSelectAdminProject } from "@/lib/person-select/server/adminProjectService";

describe("person select admin project service contract", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.failures.mockResolvedValue([]);
    mocks.deliveries.mockResolvedValue([]);
    mocks.signedUrls.mockImplementation(async (paths: string[]) => new Map(paths.map((path) => [path, `signed:${path}`])));
  });

  it("keeps the existing individual admin response shape while assembling rows outside the route", async () => {
    mocks.base.mockResolvedValue({
      event: {
        id: "event-1",
        access_mode: "individual",
        categories: [{ key: "profile", label: "프로필", pick: 1 }],
        offers: [],
        extra_price: 0,
      },
      people: [{
        id: "person-1",
        display_name: "정연호",
        group_label: null,
        first_seen_at: null,
        last_seen_at: null,
        submitted_at: null,
        orders: [],
      }],
      choices: [{
        id: "choice-1",
        person_id: "person-1",
        category_key: "profile",
        image_id: "image-1",
        updated_at: "2026-11-12T00:00:00.000Z",
        person_select_images: {
          original_file_name: "_AK_0001.JPG",
          source_rel_path: "정연호/_AK_0001.JPG",
          thumb_path: "thumb/image-1.jpg",
        },
      }],
      images: [{
        id: "image-1",
        owner_person_id: "person-1",
        owner_group: null,
        category_key: "profile",
        original_file_name: "_AK_0001.JPG",
        source_rel_path: "정연호/_AK_0001.JPG",
        thumb_path: "thumb/image-1.jpg",
        preview_path: "preview/image-1.jpg",
        sort_order: 0,
      }],
    });

    const result = await loadPersonSelectAdminProject({} as never, "event-1");

    expect(result).not.toBeNull();
    if (!result) throw new Error("관리자 프로젝트 응답이 필요합니다.");
    expect(Object.keys(result).sort()).toEqual(["event", "groups", "people", "shared", "sync"]);
    expect(result.shared).toBeNull();
    expect(result.people).toHaveLength(1);
    expect(result.people[0]).toMatchObject({
      id: "person-1",
      image_counts: { profile: 1, homeroom: 0 },
      need_counts: { profile: 1 },
      server_selected_count: 1,
      server_last_saved_at: "2026-11-12T00:00:00.000Z",
      recent_save_failure_count: 0,
      delivery_count: 0,
      delivery_revision_count: 0,
    });
    expect(result.people[0].choices[0].person_select_images?.thumb_url).toBe("signed:thumb/image-1.jpg");
    expect(result.sync).toEqual({ recent_failure_count: 0, recent_failures: [] });
  });
});
