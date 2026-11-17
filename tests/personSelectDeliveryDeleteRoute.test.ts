import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  admin: false,
  deleteDelivery: vi.fn(),
}));

vi.mock("@/lib/passkey", () => ({ isAdminSession: () => mocks.admin }));
vi.mock("@/lib/supabase", () => ({ getSupabaseAdmin: () => ({}) }));
vi.mock("@/lib/person-select/adminDeliveryDelete", () => {
  class AdminDeliveryNotFoundError extends Error {}
  return { AdminDeliveryNotFoundError, deleteAdminDelivery: mocks.deleteDelivery };
});
import { DELETE } from "@/app/api/person-select/[eventId]/deliveries/[deliveryId]/route";

const context = { params: Promise.resolve({ eventId: "event-1", deliveryId: "delivery-1" }) };

describe("person-select delivery DELETE route", () => {
  beforeEach(() => {
    mocks.admin = false;
    mocks.deleteDelivery.mockReset();
  });

  it("is available only to an administrator", async () => {
    const response = await DELETE(new NextRequest("http://localhost/api/person-select/event-1/deliveries/delivery-1", { method: "DELETE" }), context);
    expect(response.status).toBe(401);
    expect(mocks.deleteDelivery).not.toHaveBeenCalled();
  });

  it("deletes one delivery in the requested project", async () => {
    mocks.admin = true;
    mocks.deleteDelivery.mockResolvedValue({ id: "delivery-1", displayName: "final.jpg", removedFileCount: 2, stateCleanupWarning: null });
    const response = await DELETE(new NextRequest("http://localhost/api/person-select/event-1/deliveries/delivery-1", { method: "DELETE" }), context);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, id: "delivery-1", removedFileCount: 2 });
    expect(mocks.deleteDelivery).toHaveBeenCalledWith({}, { eventId: "event-1", deliveryId: "delivery-1" });
  });
});
