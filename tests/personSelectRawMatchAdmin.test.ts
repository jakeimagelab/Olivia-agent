import { describe, expect, it } from "vitest";

import type { PersonSelectAdminData } from "@/lib/person-select/adminData";
import { resolvePersonSelectAdminRawMatchModel } from "@/lib/person-select/rawMatchAdmin";

function sharedData(rating: number | null, colorLabel: number | null = null) {
  return {
    people: [],
    shared: {
      images: [{ id: "image-1", original_file_name: "A.JPG", relative_path: "C1/A.JPG" }],
      reviewers: [{
        id: "reviewer-1",
        display_name: "검토자",
        active: true,
        selection: {
          submitted_at: "2026-11-13T00:00:00.000Z",
          items: [{ image_id: "image-1", customer_rating: rating, customer_color_label: colorLabel }],
        },
        draft: null,
      }],
    },
  } as unknown as PersonSelectAdminData;
}

describe("person select admin RAW match model", () => {
  it("maps a legacy shared selection without a rating to Adobe Bridge five stars", () => {
    const model = resolvePersonSelectAdminRawMatchModel({
      data: sharedData(null),
      isShared: true,
      source: "submitted",
      reviewerScope: "all",
    });

    expect(model.preview.targets).toHaveLength(1);
    expect(model.preview.targets[0].customerRating).toBe(5);
  });

  it("preserves an explicit customer rating and does not invent a rating for color-only selection", () => {
    const rated = resolvePersonSelectAdminRawMatchModel({
      data: sharedData(3),
      isShared: true,
      source: "submitted",
      reviewerScope: "all",
    });
    const colorOnly = resolvePersonSelectAdminRawMatchModel({
      data: sharedData(null, 6),
      isShared: true,
      source: "submitted",
      reviewerScope: "all",
    });

    expect(rated.preview.targets[0].customerRating).toBe(3);
    expect(colorOnly.preview.targets[0]).toMatchObject({ customerRating: null, customerColorLabel: 6 });
  });
});
