import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import ReviewCanvasRenderer from "@/components/reviews/canvas/ReviewCanvasRenderer";
import { createReviewStoryDocument } from "./storyDocument";

describe("ReviewCanvasRenderer", () => {
  it("renders canonical dimensions and stored image/text layout values", () => {
    const documentValue = createReviewStoryDocument({
      reviewText: "줄바꿈 기준이 되는 긴 리뷰 본문",
      hospitalName: "포토클리닉",
      photo: { src: "data:image/png;base64,AA==" },
    }, { template: "photo_bottom" });
    documentValue.elements = documentValue.elements.map((element) => element.type === "image"
      ? { ...element, cropX: 37, cropY: 62, scale: 1.35 }
      : element);

    const html = renderToStaticMarkup(createElement(ReviewCanvasRenderer, { document: documentValue }));

    expect(html).toContain("data-review-canvas-renderer");
    expect(html).toContain("width:1080px;height:1350px");
    expect(html).toContain("object-position:37% 62%");
    expect(html).toContain("transform:scale(1.35)");
    expect(html).toContain("font-size:24px");
  });
});
