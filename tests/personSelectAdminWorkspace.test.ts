import { describe, expect, it } from "vitest";
import {
  pairSelectedImagesWithDeliveries,
  resolvePersonSelectAdminStatus,
  resolvePersonSelectCustomerStage,
} from "@/lib/person-select/adminWorkspace";

describe("person select admin workspace model", () => {
  it("resolves every customer status from server state", () => {
    expect(resolvePersonSelectAdminStatus({})).toBe("selecting");
    expect(resolvePersonSelectAdminStatus({ submittedAt: "2026-11-17T00:00:00Z" })).toBe("submitted");
    expect(resolvePersonSelectAdminStatus({ submittedAt: "2026-11-17T00:00:00Z", rawMatched: true })).toBe("retouch_pending");
    expect(resolvePersonSelectAdminStatus({ deliveries: [{ status: "pending" }] })).toBe("approval_pending");
    expect(resolvePersonSelectAdminStatus({ deliveries: [{ status: "revision_requested" }] })).toBe("revision_requested");
    expect(resolvePersonSelectAdminStatus({ deliveryState: "approved", deliveries: [{ status: "approved" }] })).toBe("approved");
  });

  it("derives the customer stage and reopens review for a revised photo", () => {
    expect(resolvePersonSelectCustomerStage({})).toBe(1);
    expect(resolvePersonSelectCustomerStage({ submittedAt: "2026-11-17T00:00:00Z" })).toBe(1);
    expect(resolvePersonSelectCustomerStage({ submittedAt: "2026-11-17T00:00:00Z", deliveries: [{ status: "pending" }] })).toBe(2);
    expect(resolvePersonSelectCustomerStage({ deliveryState: "approved", deliveries: [{ status: "approved" }] })).toBe(3);
    expect(resolvePersonSelectCustomerStage({ deliveryState: "approved", deliveries: [{ status: "revised" }] })).toBe(2);
  });

  it("pairs an empty slot, keeps the latest delivery version, and reports unlinked deliveries", () => {
    const images = [
      { id: "image-1", original_file_name: "one.jpg", source_rel_path: "김/one.jpg" },
      { id: "image-2", original_file_name: "two.jpg", source_rel_path: "김/two.jpg" },
    ];
    const result = pairSelectedImagesWithDeliveries(images, [
      { id: "old", linked_image_id: "image-1", current_version: 1, status: "pending" as const, updated_at: "2026-11-16" },
      { id: "new", linked_image_id: "image-1", current_version: 2, status: "revision_requested" as const, updated_at: "2026-11-17" },
      { id: "loose", linked_image_id: null, current_version: 1, status: "pending" as const },
    ]);

    expect(result.slots.map((slot) => slot.delivery?.id ?? null)).toEqual(["new", null]);
    expect(result.unlinked.map((delivery) => delivery.id)).toEqual(["loose"]);
  });
});

