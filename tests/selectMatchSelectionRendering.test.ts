import { describe, expect, it } from "vitest";

import { hasSceneSelectionDifference } from "@/lib/selectMatch/selectionRendering";

describe("hasSceneSelectionDifference", () => {
  it("ignores selection changes that belong to another scene", () => {
    const previous = new Set(["a_0001"]);
    const next = new Set(["a_0001", "b_0001"]);

    expect(hasSceneSelectionDifference([{ basename: "A_0001" }, { basename: "A_0002" }], previous, next)).toBe(false);
  });

  it("detects a changed photo inside the scene", () => {
    const previous = new Set(["a_0001"]);
    const next = new Set(["a_0002"]);

    expect(hasSceneSelectionDifference([{ basename: "A_0001" }, { basename: "A_0002" }], previous, next)).toBe(true);
  });

  it("accepts the identical selection set without scanning changes", () => {
    const selected = new Set(["a_0001"]);

    expect(hasSceneSelectionDifference([{ basename: "A_0001" }], selected, selected)).toBe(false);
  });
});
