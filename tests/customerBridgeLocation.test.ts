import { describe, expect, it } from "vitest";
import {
  customerBridgeLocationImages,
  customerBridgeLocationStorageValue,
  customerBridgeParentLocation,
  restoreCustomerBridgeLocation,
} from "@/components/select-gallery/useCustomerBridgeLocation";

const images = [
  { id: "root", relative_path: "root.jpg" },
  { id: "one", relative_path: "C1/one.jpg" },
  { id: "two", relative_path: "C1/deeper/two.jpg" },
  { id: "three", relative_path: "C2/three.jpg" },
];

describe("customer Bridge location", () => {
  it("serializes and restores only valid locations", () => {
    const folders = new Set(["C1", "C1/deeper", "C2"]);
    expect(customerBridgeLocationStorageValue({ kind: "folder", path: "C1/deeper" })).toBe("folder:C1/deeper");
    expect(restoreCustomerBridgeLocation("all", folders)).toEqual({ kind: "all" });
    expect(restoreCustomerBridgeLocation("folder:C1", folders)).toEqual({ kind: "folder", path: "C1" });
    expect(restoreCustomerBridgeLocation("folder:missing", folders)).toEqual({ kind: "root" });
  });

  it("keeps root, all, and direct folder photos distinct", () => {
    expect(customerBridgeLocationImages(images, { kind: "root" })).toEqual([]);
    expect(customerBridgeLocationImages(images, { kind: "all" }).map((image) => image.id)).toEqual(["root", "one", "two", "three"]);
    expect(customerBridgeLocationImages(images, { kind: "folder", path: "C1" }).map((image) => image.id)).toEqual(["one"]);
  });

  it("moves to the immediate parent without confusing root photos", () => {
    expect(customerBridgeParentLocation({ kind: "folder", path: "C1/deeper" })).toEqual({ kind: "folder", path: "C1" });
    expect(customerBridgeParentLocation({ kind: "folder", path: "C1" })).toEqual({ kind: "root" });
    expect(customerBridgeParentLocation({ kind: "all" })).toEqual({ kind: "root" });
  });
});
