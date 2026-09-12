import { describe, expect, it } from "vitest";
import { isPendingReviewAssetPath, pendingReviewVariantPath, reviewVariantHasCanonicalAsset, validReviewAssetPath } from "./storage";

describe("review content canonical asset compatibility", () => {
  const variantId = "123e4567-e89b-12d3-a456-426614174000";

  it("uses a valid non-null pending path for databases that still enforce NOT NULL", () => {
    const path = pendingReviewVariantPath(variantId);
    expect(validReviewAssetPath(path)).toBe(true);
    expect(isPendingReviewAssetPath(path)).toBe(true);
    expect(reviewVariantHasCanonicalAsset({ image_storage_path: path, generation_metadata: { renderer: "review-canvas-renderer" } })).toBe(false);
  });

  it("accepts a saved canonical renderer asset and preserves legacy saved variants", () => {
    expect(reviewVariantHasCanonicalAsset({
      image_storage_path: `variants/${variantId}/review.png`,
      generation_metadata: { renderer: "review-canvas-renderer", canonicalRenderedAt: "2026-09-12T12:00:00.000Z" },
    })).toBe(true);
    expect(reviewVariantHasCanonicalAsset({
      image_storage_path: `variants/${variantId}/legacy.png`,
      generation_metadata: { renderer: "svg-sharp" },
    })).toBe(true);
  });
});
