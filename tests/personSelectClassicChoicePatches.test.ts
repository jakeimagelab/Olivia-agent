import { describe, expect, it } from "vitest";

import {
  buildClassicChoiceFeedbackPatches,
  buildClassicChoiceSelectionPatches,
} from "@/lib/person-select/classicChoicePatches";

describe("classic person choice patches", () => {
  it("clears the previous photo before selecting in a single-choice category", () => {
    expect(buildClassicChoiceSelectionPatches({
      imageId: "photo-2",
      selectedIds: new Set(["photo-1"]),
      limit: 1,
    })).toEqual({
      limitReached: false,
      patches: [
        { imageId: "photo-1", selected: false },
        { imageId: "photo-2", selected: true },
        { imageId: "photo-2", retouchKeys: [] },
        { imageId: "photo-2", memo: "" },
      ],
    });
  });

  it("does not exceed a multi-choice category limit", () => {
    expect(buildClassicChoiceSelectionPatches({
      imageId: "photo-3",
      selectedIds: new Set(["photo-1", "photo-2"]),
      limit: 2,
    })).toEqual({ patches: [], limitReached: true });
  });

  it("keeps the selected photo editable when the category is full", () => {
    const result = buildClassicChoiceSelectionPatches({
      imageId: "photo-2",
      selectedIds: new Set(["photo-1", "photo-2"]),
      limit: 2,
      retouchKeys: ["skin"],
      memo: "자연스럽게",
    });

    expect(result.limitReached).toBe(false);
    expect(result.patches).toContainEqual({ imageId: "photo-2", selected: true });
    expect(result.patches).toContainEqual({ imageId: "photo-2", retouchKeys: ["skin"] });
    expect(result.patches).toContainEqual({ imageId: "photo-2", memo: "자연스럽게" });
  });

  it("builds the same feedback patches for PC and mobile", () => {
    expect(buildClassicChoiceFeedbackPatches("photo-1", ["skin"], "확인"))
      .toEqual([
        { imageId: "photo-1", retouchKeys: ["skin"] },
        { imageId: "photo-1", memo: "확인" },
      ]);
  });
});
