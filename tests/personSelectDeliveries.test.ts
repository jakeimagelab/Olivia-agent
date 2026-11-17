import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  canFinalizeDeliveries,
  isUnchangedDeliverySource,
  nextDeliveryStatus,
  personSelectDeliveryBundleKey,
  resolvePersonSelectDeliveryDownloadMode,
  resolveDeliveryOwner,
  selectExpiredDeliveryOwners,
} from "@/lib/person-select/deliveries";
import {
  deliveryImportFailureOutput,
  isExistingStorageObjectError,
  retryDeliveryImportOperation,
} from "@/scripts/person-select-delivery-import";

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
import { POST as startNasDownload } from "@/app/api/pick/[eventSlug]/deliveries/download/route";

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

  it("links renamed retouched files by the unique original capture filename without the source folder", () => {
    const selectedWithNames = [
      { id: "i1", personId: "p1", captureTimeMs: null, fileName: "선생님프로필_김민수__AK_7351.JPG" },
      { id: "i2", personId: "p2", captureTimeMs: null, fileName: "담임선생님_2반_DSC04107.JPG" },
    ];
    expect(resolveDeliveryOwner({ fileName: "_AK_7351-EVT.jpg" }, people, selectedWithNames)).toEqual({ personId: "p1", linkedImageId: "i1", method: "filename" });
    expect(resolveDeliveryOwner({ fileName: "DSC04107.jpg" }, people, selectedWithNames)).toEqual({ personId: "p2", linkedImageId: "i2", method: "filename" });
  });

  it("does not guess when the same capture filename belongs to multiple selected originals", () => {
    const ambiguous = [
      { id: "i1", personId: "p1", captureTimeMs: null, fileName: "A__AK_0001.JPG" },
      { id: "i2", personId: "p2", captureTimeMs: null, fileName: "B__AK_0001.JPG" },
    ];
    expect(resolveDeliveryOwner({ fileName: "_AK_0001-EVT.jpg" }, people, ambiguous)).toEqual({ personId: null, linkedImageId: null, method: null });
  });

  it("moves a requested photo to revised on a new version and requires every photo approved", () => {
    expect(nextDeliveryStatus("revision_requested", true)).toBe("revised");
    expect(nextDeliveryStatus("approved", true)).toBe("approved");
    expect(canFinalizeDeliveries(["approved", "revised"])).toBe(false);
    expect(canFinalizeDeliveries(["approved", "approved"])).toBe(true);
    expect(canFinalizeDeliveries([])).toBe(false);
  });

  it("uses Storage through 50 photos and NAS from 51 photos per recipient bundle", () => {
    expect(resolvePersonSelectDeliveryDownloadMode(50)).toBe("storage");
    expect(resolvePersonSelectDeliveryDownloadMode(51)).toBe("nas");
    expect(personSelectDeliveryBundleKey("individual", "person-1")).toBe("person:person-1");
    expect(personSelectDeliveryBundleKey("project_shared", null)).toBe("shared");
  });

  it("skips an unchanged source on retry but creates a new version after the file changes", () => {
    const previous = {
      sourceVirtualPath: "root-1/보정본/사진.jpg",
      size: 5_000_000,
      uploadedAt: "2026-11-17T05:00:00.000Z",
    };
    expect(isUnchangedDeliverySource({
      sourceVirtualPath: "root-1/보정본/사진.jpg",
      size: 5_000_000,
      modifiedAtMs: new Date("2026-11-17T04:59:59.000Z").getTime(),
      previous,
    })).toBe(true);
    expect(isUnchangedDeliverySource({
      sourceVirtualPath: previous.sourceVirtualPath,
      size: 5_000_001,
      modifiedAtMs: new Date("2026-11-17T04:59:59.000Z").getTime(),
      previous,
    })).toBe(false);
    expect(isUnchangedDeliverySource({
      sourceVirtualPath: previous.sourceVirtualPath,
      size: 5_000_000,
      modifiedAtMs: new Date("2026-11-17T05:00:03.000Z").getTime(),
      previous,
    })).toBe(false);
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
    expect(JSON.parse(deliveryImportFailureOutput(new Error("Internal server error."), "existing_delivery_load"))).toEqual({
      ok: false,
      error: "서버가 일시적으로 응답하지 않았습니다. 자동 재시도 후에도 실패했습니다. (Internal server error.)",
      stage: "existing_delivery_load",
    });
  });

  it("retries transient server failures without retrying permanent errors", async () => {
    const transient = vi.fn()
      .mockRejectedValueOnce(new Error("Internal server error."))
      .mockRejectedValueOnce(new Error("fetch failed"))
      .mockResolvedValue("ok");
    const wait = vi.fn(async () => undefined);
    await expect(retryDeliveryImportOperation(transient, wait)).resolves.toBe("ok");
    expect(transient).toHaveBeenCalledTimes(3);
    expect(wait).toHaveBeenCalledTimes(2);

    const permanent = vi.fn().mockRejectedValue(new Error("폴더가 없습니다."));
    await expect(retryDeliveryImportOperation(permanent, wait)).rejects.toThrow("폴더가 없습니다.");
    expect(permanent).toHaveBeenCalledTimes(1);
  });

  it("recognizes an object left behind by a successful storage retry", () => {
    expect(isExistingStorageObjectError(new Error("The resource already exists"))).toBe(true);
    expect(isExistingStorageObjectError({ message: "Duplicate" })).toBe(true);
    expect(isExistingStorageObjectError(new Error("Internal server error."))).toBe(false);
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

  it("does not start a NAS package before final approval", async () => {
    const response = await startNasDownload(new NextRequest("http://localhost/api/pick/event/deliveries/download", { method: "POST" }), { params: Promise.resolve({ eventSlug: "event" }) });
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ error: "최종 확인 후 다운로드할 수 있습니다." });
  });
});
