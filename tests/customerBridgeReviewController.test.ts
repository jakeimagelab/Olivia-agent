import { describe, expect, it } from "vitest";
import {
  customerBridgeFullscreenStep,
  customerBridgeReviewImages,
  customerBridgeReviewSelectionIds,
} from "@/components/select-gallery/useCustomerBridgeReviewController";
import type { CustomerBridgeImage } from "@/lib/select-gallery/customerBridgeTypes";

const images = [
  { id: "a", original_file_name: "A.JPG" },
  { id: "b", original_file_name: "B.JPG" },
  { id: "c", original_file_name: "C.JPG" },
] as CustomerBridgeImage[];

describe("customer Bridge review controller helpers", () => {
  it("opens review with selected photos in the project image order", () => {
    expect(customerBridgeReviewSelectionIds(images, new Set(["c", "a"]))).toEqual(["a", "c"]);
  });

  it("keeps the saved review order while omitting unavailable images", () => {
    const imageById = new Map(images.map((image) => [image.id, image]));
    expect(customerBridgeReviewImages(["c", "missing", "a"], imageById).map((image) => image.id)).toEqual(["c", "a"]);
  });

  it("cycles fullscreen photos in both directions without changing marks", () => {
    expect(customerBridgeFullscreenStep(images, "c", 1)?.id).toBe("a");
    expect(customerBridgeFullscreenStep(images, "a", -1)?.id).toBe("c");
    expect(customerBridgeFullscreenStep([], null, 1)).toBeNull();
  });
});
