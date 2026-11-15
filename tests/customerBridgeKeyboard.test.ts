import { describe, expect, it } from "vitest";
import {
  customerBridgeGridNavigationTarget,
  resolveCustomerBridgeKeyboardCommand,
} from "@/lib/select-gallery/customerBridgeKeyboard";

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

describe("customer Bridge keyboard command resolution", () => {
  const base = {
    guideOpen: false,
    resetConfirmOpen: false,
    mobileSideOpen: false,
    fullscreenId: null,
    reviewOpen: false,
    reviewActiveId: null,
    reviewCanRestore: false,
    focusedImageId: "photo-1",
    readOnly: false,
  };

  it("keeps modal escape precedence ahead of every workspace shortcut", () => {
    expect(resolveCustomerBridgeKeyboardCommand({ ...base, key: "1", guideOpen: true }))
      .toEqual({ type: "blocked" });
    expect(resolveCustomerBridgeKeyboardCommand({ ...base, key: "Escape", guideOpen: true }))
      .toEqual({ type: "close-guide" });
    expect(resolveCustomerBridgeKeyboardCommand({ ...base, key: "Escape", resetConfirmOpen: true }))
      .toEqual({ type: "close-reset" });
  });

  it("resolves review, fullscreen, and mark commands without UI state mutation", () => {
    expect(resolveCustomerBridgeKeyboardCommand({ ...base, key: "b", metaKey: true }))
      .toEqual({ type: "open-review" });
    expect(resolveCustomerBridgeKeyboardCommand({ ...base, key: " " }))
      .toEqual({ type: "open-fullscreen", imageId: "photo-1" });
    expect(resolveCustomerBridgeKeyboardCommand({ ...base, key: "5" }))
      .toEqual({ type: "apply-mark", value: 5 });
    expect(resolveCustomerBridgeKeyboardCommand({ ...base, key: "5", readOnly: true }))
      .toBeNull();
  });

  it("keeps review navigation ahead of fullscreen and grid navigation", () => {
    expect(resolveCustomerBridgeKeyboardCommand({
      ...base,
      key: "ArrowDown",
      fullscreenId: "photo-1",
      reviewOpen: true,
      reviewActiveId: "photo-2",
    })).toEqual({ type: "remove-review-image", imageId: "photo-2" });
    expect(resolveCustomerBridgeKeyboardCommand({
      ...base,
      key: "ArrowRight",
      fullscreenId: "photo-1",
    })).toEqual({ type: "move-fullscreen", delta: 1 });
    expect(resolveCustomerBridgeKeyboardCommand({ ...base, key: "ArrowDown" }))
      .toEqual({ type: "move-grid", key: "ArrowDown" });
  });
});
