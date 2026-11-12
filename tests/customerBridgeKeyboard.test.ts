import { describe, expect, it } from "vitest";
import { customerBridgeGridNavigationTarget } from "@/components/select-gallery/useCustomerBridgeKeyboard";

describe("customer Bridge keyboard grid navigation", () => {
  const orderedIds = ["a", "b", "c", "d", "e", "f"];

  it("moves horizontally and clamps at the grid edges", () => {
    expect(customerBridgeGridNavigationTarget({ orderedIds, currentId: "b", key: "ArrowRight", columns: 3 })).toBe("c");
    expect(customerBridgeGridNavigationTarget({ orderedIds, currentId: "a", key: "ArrowLeft", columns: 3 })).toBe("a");
  });

  it("uses the current column count for vertical movement", () => {
    expect(customerBridgeGridNavigationTarget({ orderedIds, currentId: "b", key: "ArrowDown", columns: 3 })).toBe("e");
    expect(customerBridgeGridNavigationTarget({ orderedIds, currentId: "e", key: "ArrowUp", columns: 3 })).toBe("b");
  });

  it("ignores missing photos and non-arrow keys", () => {
    expect(customerBridgeGridNavigationTarget({ orderedIds, currentId: "missing", key: "ArrowRight", columns: 3 })).toBeNull();
    expect(customerBridgeGridNavigationTarget({ orderedIds, currentId: "a", key: "Enter", columns: 3 })).toBeNull();
  });
});
