import { describe, expect, it, vi } from "vitest";

import { collectDeliveryStoragePaths, deleteAdminDelivery } from "@/lib/person-select/adminDeliveryDelete";

function query(result: Record<string, unknown>) {
  const value = { ...result, error: result.error ?? null };
  const chain: Record<string, any> = {};
  for (const method of ["select", "eq", "is", "in", "order", "delete", "update"]) {
    chain[method] = vi.fn(() => chain);
  }
  chain.maybeSingle = vi.fn(async () => value);
  chain.then = (resolve: (next: unknown) => unknown, reject?: (error: unknown) => unknown) => Promise.resolve(value).then(resolve, reject);
  return chain;
}

describe("admin person-select delivery deletion", () => {
  it("collects unique original and preview paths from every version", () => {
    expect(collectDeliveryStoragePaths([
      { storage_path_original: "delivery/original.jpg", storage_path_preview: "delivery/preview.jpg" },
      { storage_path_original: "delivery/original.jpg", storage_path_preview: null },
    ])).toEqual(["delivery/original.jpg", "delivery/preview.jpg"]);
  });

  it("removes Storage files before deleting the delivery and resets an empty owner", async () => {
    const deliveryRead = query({ data: { id: "delivery-1", event_id: "event-1", person_id: "person-1", display_name: "final.jpg" } });
    const versionRead = query({ data: [
      { storage_path_original: "event-1/delivery-1/v1/original.jpg", storage_path_preview: "event-1/delivery-1/v1/preview.jpg" },
      { storage_path_original: "event-1/delivery-1/v2/original.jpg", storage_path_preview: "event-1/delivery-1/v2/preview.jpg" },
    ] });
    const deliveryDelete = query({ data: { id: "delivery-1" } });
    const remainingCount = query({ count: 0, data: null });
    const personUpdate = query({ data: null });
    const remove = vi.fn(async () => ({ error: null }));
    let deliveryCall = 0;
    const db = {
      from: vi.fn((table: string) => {
        if (table === "person_select_deliveries") return [deliveryRead, deliveryDelete, remainingCount][deliveryCall++];
        if (table === "person_select_delivery_versions") return versionRead;
        if (table === "person_select_people") return personUpdate;
        throw new Error(`unexpected table: ${table}`);
      }),
      storage: { from: vi.fn(() => ({ remove })) },
    };

    const result = await deleteAdminDelivery(db as never, { eventId: "event-1", deliveryId: "delivery-1" });

    expect(remove).toHaveBeenCalledWith([
      "event-1/delivery-1/v1/original.jpg",
      "event-1/delivery-1/v1/preview.jpg",
      "event-1/delivery-1/v2/original.jpg",
      "event-1/delivery-1/v2/preview.jpg",
    ]);
    expect(deliveryDelete.delete).toHaveBeenCalledTimes(1);
    expect(remove.mock.invocationCallOrder[0]).toBeLessThan(deliveryDelete.delete.mock.invocationCallOrder[0]);
    expect(personUpdate.update).toHaveBeenCalledWith(expect.objectContaining({ delivery_state: "none", delivery_approved_at: null }));
    expect(result).toMatchObject({ id: "delivery-1", displayName: "final.jpg", removedFileCount: 4 });
  });

  it("keeps the database row when Storage deletion fails", async () => {
    const deliveryRead = query({ data: { id: "delivery-1", event_id: "event-1", person_id: "person-1", display_name: "final.jpg" } });
    const versionRead = query({ data: [{ storage_path_original: "original.jpg", storage_path_preview: "preview.jpg" }] });
    const deliveryDelete = query({ data: { id: "delivery-1" } });
    let deliveryCall = 0;
    const db = {
      from: vi.fn((table: string) => {
        if (table === "person_select_deliveries") return [deliveryRead, deliveryDelete][deliveryCall++];
        if (table === "person_select_delivery_versions") return versionRead;
        throw new Error(`unexpected table: ${table}`);
      }),
      storage: { from: vi.fn(() => ({ remove: vi.fn(async () => ({ error: { message: "storage unavailable" } })) })) },
    };

    await expect(deleteAdminDelivery(db as never, { eventId: "event-1", deliveryId: "delivery-1" }))
      .rejects.toThrow("보정본 파일을 삭제하지 못했습니다");
    expect(deliveryDelete.delete).not.toHaveBeenCalled();
  });
});
