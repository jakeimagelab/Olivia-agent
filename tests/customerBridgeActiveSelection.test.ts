import { describe, expect, it } from "vitest";
import { customerBridgeClickSelection } from "@/components/select-gallery/useCustomerBridgeActiveSelection";

const orderedIds = ["a", "b", "c", "d"];

describe("customer Bridge active selection", () => {
  it("replaces the work target on a plain click without creating a customer mark", () => {
    const result = customerBridgeClickSelection({
      current: new Set(["a", "b"]),
      imageId: "c",
      orderedIds,
      anchorId: "a",
      modifiers: { shiftKey: false, metaKey: false, ctrlKey: false },
    });
    expect([...result.activeImageIds]).toEqual(["c"]);
    expect(result.anchorId).toBe("c");
    expect(result).not.toHaveProperty("rating");
  });

  it("adds or removes one work target with Cmd/Ctrl click", () => {
    const added = customerBridgeClickSelection({
      current: new Set(["a"]),
      imageId: "c",
      orderedIds,
      anchorId: "a",
      modifiers: { shiftKey: false, metaKey: true, ctrlKey: false },
    });
    expect([...added.activeImageIds]).toEqual(["a", "c"]);
    const removed = customerBridgeClickSelection({
      current: added.activeImageIds,
      imageId: "a",
      orderedIds,
      anchorId: added.anchorId,
      modifiers: { shiftKey: false, metaKey: false, ctrlKey: true },
    });
    expect([...removed.activeImageIds]).toEqual(["c"]);
  });

  it("keeps the anchor and adds the ordered range with Shift click", () => {
    const result = customerBridgeClickSelection({
      current: new Set(["a"]),
      imageId: "d",
      orderedIds,
      anchorId: "b",
      modifiers: { shiftKey: true, metaKey: false, ctrlKey: false },
    });
    expect([...result.activeImageIds]).toEqual(["a", "b", "c", "d"]);
    expect(result.anchorId).toBe("b");
  });
});
