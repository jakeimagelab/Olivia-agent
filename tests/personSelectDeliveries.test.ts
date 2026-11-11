import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  canFinalizeDeliveries,
  nextDeliveryStatus,
  resolveDeliveryOwner,
  selectExpiredDeliveryOwners,
} from "@/lib/person-select/deliveries";
import { deliveryImportFailureOutput } from "@/scripts/person-select-delivery-import";

const mocks = vi.hoisted(() => ({
  ctx: null as Record<string, any> | null,
  from: vi.fn(),
  createDownloadUrls: vi.fn(),
}));

vi.mock("@/lib/person-select/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/person-select/server")>();
  return { ...actual, getPublicSessionContext: vi.fn(async () => mocks.ctx) };
});

vi.mock("@/lib/person-select/deliveryServer", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/person-select/deliveryServer")>();
  return { ...actual, createDeliveryDownloadUrls: mocks.createDownloadUrls };
});

vi.mock("@/lib/supabase", () => ({
  getSupabaseAdmin: () => ({ from: mocks.from }),
}));

vi.mock("@/lib/select-gallery/publicSelection", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/select-gallery/publicSelection")>();
  return { ...actual, enforcePublicSelectionRateLimit: vi.fn(async () => undefined) };
});

import { GET as getMe } from "@/app/api/pick/[eventSlug]/me/route";
import { GET as getDownloadUrls } from "@/app/api/pick/[eventSlug]/deliveries/download-urls/route";

function updateQuery() {
  const query = { eq: vi.fn(() => query), then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data: null, error: null }).then(resolve) };
  return { update: vi.fn(() => query) };
}

describe("person select delivery linking", () => {
  const people = [{ id: "p1", displayName: "김민수" }, { id: "p2", displayName: "이지영" }];
  const selected = [
    { id: "i1", personId: "p1", captureTimeMs: 1_000_000 },
    { id: "i2", personId: "p2", captureTimeMs: 2_000_000 },
  ];

  it("uses EXIF first, then filename, then folder, otherwise leaves it unassigned", () => {
    expect(resolveDeliveryOwner({ fileName: "unknown.jpg", captureTimeMs: 1_001_500 }, people, selected)).toEqual({ personId: "p1", linkedImageId: "i1", method: "exif" });
    expect(resolveDeliveryOwner({ fileName: "김민수_프로필.jpg" }, people, selected)).toEqual({ personId: "p1", linkedImageId: null, method: "filename" });
    expect(resolveDeliveryOwner({ fileName: "final.jpg", parentFolderName: "이지영님" }, people, selected)).toEqual({ personId: "p2", linkedImageId: null, method: "folder" });
    expect(resolveDeliveryOwner({ fileName: "final.jpg", parentFolderName: "미확인" }, people, selected)).toEqual({ personId: null, linkedImageId: null, method: null });
  });

  it("moves a requested photo to revised on a new version and requires every photo approved", () => {
    expect(nextDeliveryStatus("revision_requested", true)).toBe("revised");
    expect(nextDeliveryStatus("approved", true)).toBe("approved");
    expect(canFinalizeDeliveries(["approved", "revised"])).toBe(false);
    expect(canFinalizeDeliveries(["approved", "approved"])).toBe(true);
    expect(canFinalizeDeliveries([])).toBe(false);
  });

  it("selects only retention-expired owners that have not already been purged", () => {
    const owners = [
      { id: "expired", approvedAt: "2026-01-01T00:00:00.000Z", retentionDays: 30, purgedAt: null },
      { id: "extended", approvedAt: "2026-01-01T00:00:00.000Z", retentionDays: 30, extendedUntil: "2027-01-01T00:00:00.000Z", purgedAt: null },
      { id: "purged", approvedAt: "2026-01-01T00:00:00.000Z", retentionDays: 30, purgedAt: "2026-03-01T00:00:00.000Z" },
    ];
    expect(selectExpiredDeliveryOwners(owners, new Date("2026-11-11T00:00:00.000Z").getTime()).map((owner) => owner.id)).toEqual(["expired"]);
  });

  it("prints a structured runner failure as the final JSON line", () => {
    expect(JSON.parse(deliveryImportFailureOutput(new Error("storage failed")))).toEqual({ ok: false, error: "storage failed", stage: "delivery_import" });
  });
});

describe("person select delivery public safety", () => {
  beforeEach(() => {
    mocks.from.mockReset();
    mocks.createDownloadUrls.mockReset();
    mocks.from.mockImplementation(() => updateQuery());
    mocks.ctx = {
      event: { id: "event-1", slug: "event", title: "테스트", customer_stage: "delivery", delivery_retention_days: 30, retouch_options: [], memo_max: 300 },
      person: { id: "person-1", display_name: "고객", group_label: null, submitted_at: null, delivery_state: "reviewing", delivery_approved_at: null, delivery_downloaded_at: null },
    };
  });

  it("does not return original categories or choices in delivery stage", async () => {
    const response = await getMe(new NextRequest("http://localhost/api/pick/event/me"), { params: Promise.resolve({ eventSlug: "event" }) });
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.event.customer_stage).toBe("delivery");
    expect(body.categories).toEqual([]);
    expect(body).not.toHaveProperty("images");
  });

  it("returns 403 for original download URLs before final approval", async () => {
    const response = await getDownloadUrls(new NextRequest("http://localhost/api/pick/event/deliveries/download-urls"), { params: Promise.resolve({ eventSlug: "event" }) });
    expect(response.status).toBe(403);
    expect(mocks.createDownloadUrls).not.toHaveBeenCalled();
  });
});
