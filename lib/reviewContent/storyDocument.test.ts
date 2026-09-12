import { describe, expect, it } from "vitest";
import {
  createBlankReviewStoryDocument, createReviewCoverDocument, createReviewDesignDocument,
  createReviewStoryDocument, duplicateStoryElement, isReviewStoryDocument, resizeReviewStoryDocument,
  reviewStoryCanvasRatio, splitReviewForPages, toReviewStoryTemplateDocument,
} from "./storyDocument";

describe("review story document", () => {
  it("creates a backward-compatible 1080x1350 editor document", () => {
    const document = createReviewStoryDocument({ reviewText: "정말 만족했습니다.", hospitalName: "올리비아의원" }, { template: "photo_bottom" });
    expect(document.width).toBe(1080);
    expect(document.height).toBe(1350);
    expect(document.elements.some((element) => element.binding === "reviewBody")).toBe(true);
    expect(document.elements.some((element) => element.binding === "clinicName")).toBe(true);
  });

  it("splits review copy across the requested page count", () => {
    expect(splitReviewForPages("첫 문장입니다. 둘째 문장입니다. 셋째 문장입니다.", 4)).toHaveLength(4);
  });

  it("duplicates an element without mutating its source", () => {
    const source = createReviewStoryDocument({ reviewText: "후기", hospitalName: "병원" }).elements[0];
    const copy = duplicateStoryElement(source, "copy");
    expect(copy.id).toBe("copy");
    expect(copy.x).toBe(source.x + 20);
    expect(source.id).not.toBe("copy");
  });

  it("removes customer content when saving a reusable template", () => {
    const document = createReviewStoryDocument({ reviewText: "실제 후기", hospitalName: "실제 병원", photo: { src: "blob:test", storagePath: "references/a/file.jpg" } }, { template: "photo_bottom" });
    const template = toReviewStoryTemplateDocument(document);
    const review = template.elements.find((element) => element.binding === "reviewBody" && element.type === "text");
    const photo = template.elements.find((element) => element.binding === "photo1" && element.type === "image");
    expect(review?.type === "text" ? review.text : null).toBe("{{reviewBody}}");
    expect(photo?.type === "image" ? photo.src : null).toBeUndefined();
  });

  it("adds a cover without copying private review body text", () => {
    const cover = createReviewCoverDocument({ reviewText: "복사되면 안 되는 실제 후기", hospitalName: "올리비아의원", doctorName: "김원장", date: "2026-09-12" }, "editorial");
    expect(cover.width).toBe(1080);
    expect(cover.height).toBe(1350);
    expect(cover.elements.some((element) => element.type === "text" && element.text.includes("복사되면 안 되는"))).toBe(false);
    expect(cover.elements.some((element) => element.type === "text" && element.text === "올리비아의원")).toBe(true);
  });

  it("creates independent blank and design pages on the canonical canvas", () => {
    const blank = createBlankReviewStoryDocument();
    const design = createReviewDesignDocument({ reviewText: "후기", hospitalName: "올리비아의원" }, "cta");
    expect(blank.elements).toEqual([]);
    expect(design.elements.length).toBeGreaterThan(0);
    expect(design.width).toBe(blank.width);
    expect(design.height).toBe(blank.height);
  });

  it.each([
    ["4:5", 1350],
    ["3:4", 1440],
    ["2:3", 1620],
    ["1:1", 1080],
  ] as const)("resizes the canvas to %s while preserving anchored content", (ratio, height) => {
    const source = createReviewStoryDocument({ reviewText: "후기", hospitalName: "병원" }, { template: "text_only" });
    const bottom = source.elements.find((element) => element.id === "url")!;
    const bottomGap = source.height - (bottom.y + bottom.height);
    const resized = resizeReviewStoryDocument(source, ratio);
    const nextBottom = resized.elements.find((element) => element.id === "url")!;

    expect(resized.width).toBe(1080);
    expect(resized.height).toBe(height);
    expect(reviewStoryCanvasRatio(resized)).toBe(ratio);
    expect(resized.height - (nextBottom.y + nextBottom.height)).toBe(bottomGap);
    expect(isReviewStoryDocument(resized)).toBe(true);
  });

  it("extends a full-height image instead of stretching text layers", () => {
    const source = createReviewStoryDocument({ reviewText: "후기", hospitalName: "병원" }, { template: "photo_overlay" });
    const resized = resizeReviewStoryDocument(source, "2:3");
    const image = resized.elements.find((element) => element.type === "image");
    const review = resized.elements.find((element) => element.id === "review");

    expect(image?.height).toBe(1620);
    expect(review?.height).toBe(source.elements.find((element) => element.id === "review")?.height);
  });

  it("keeps the spacing between a long body box and bottom metadata", () => {
    const source = createReviewStoryDocument({ reviewText: "긴 후기 ".repeat(20), hospitalName: "병원" }, { template: "photo_bottom" });
    const sourceReview = source.elements.find((element) => element.id === "review")!;
    const sourceClinic = source.elements.find((element) => element.id === "clinic")!;
    const resized = resizeReviewStoryDocument(source, "1:1");
    const review = resized.elements.find((element) => element.id === "review")!;
    const clinic = resized.elements.find((element) => element.id === "clinic")!;

    expect(clinic.y - (review.y + review.height)).toBe(sourceClinic.y - (sourceReview.y + sourceReview.height));
    expect(resizeReviewStoryDocument(resized, "4:5").elements.find((element) => element.id === "review")?.y).toBe(sourceReview.y);
  });
});
